import getBitcoinClients from '@common/utils/bitcoinClients';
import { base64, hex } from '@scure/base';
import { Address, OutScript, SigHash, Transaction } from '@scure/btc-signer';
import { getPrevOut } from '@scure/btc-signer/utxo';
import {
  btcTransaction,
  getBtcNetworkDefinition,
  type InputToSign,
  type SettingsNetwork,
  type TransactionContext,
} from '@secretkeylabs/xverse-core';

function inferOwnedInputs(tx: Transaction, context: TransactionContext): InputToSign[] {
  const addresses = [context.paymentAddress.address, context.ordinalsAddress.address];
  const addressCodec = Address(getBtcNetworkDefinition('Regtest'));
  const scripts = addresses.map((address) =>
    hex.encode(OutScript.encode(addressCodec.decode(address))),
  );
  const inputs: InputToSign[] = [];
  for (let index = 0; index < tx.inputsLength; index++) {
    const input = tx.getInput(index);
    if (input.tapLeafScript?.length)
      throw new Error('Script-path inputs require explicit signing descriptors.');
    if (!input.witnessUtxo && !input.nonWitnessUtxo) continue;
    const addressIndex = scripts.indexOf(hex.encode(getPrevOut(input).script));
    if (addressIndex >= 0)
      inputs.push({ address: addresses[addressIndex], signingIndexes: [index] });
  }
  if (!inputs.length) throw new Error('No inputs match the selected wallet.');
  return inputs;
}

export async function verifyRegtestPsbtFunding(
  context: TransactionContext,
  payload: {
    psbtBase64: string;
    inputsToSign?: InputToSign[];
    broadcast?: boolean;
    finalize?: boolean;
  },
  settings: SettingsNetwork,
): Promise<InputToSign[]> {
  const tx = Transaction.fromPSBT(base64.decode(payload.psbtBase64), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
  });
  const inputs = payload.inputsToSign ?? inferOwnedInputs(tx, context);
  const { bitcoin, regtestOrdinals } = getBitcoinClients(settings);
  const paymentAddress = context.paymentAddress.address;
  const addressCodec = Address(getBtcNetworkDefinition('Regtest'));
  const selected = inputs.flatMap(({ address, signingIndexes }) =>
    signingIndexes.map((index) => ({ address, index })),
  );
  const partialListing =
    selected.length === 1 &&
    selected[0].index === 0 &&
    tx.outputsLength === 1 &&
    tx.getInput(0).sighashType === SigHash.SINGLE_ANYONECANPAY &&
    tx.getOutput(0).amount! >
      Array.from(
        { length: tx.inputsLength },
        (_, index) => getPrevOut(tx.getInput(index)).amount,
      ).reduce((sum, amount) => sum + amount, 0n);
  const paymentCoins = selected.some(({ address }) => address === paymentAddress)
    ? await bitcoin.getUnspentUtxos(paymentAddress)
    : [];

  const facts = await Promise.all(
    selected.map(async ({ address, index }) => {
      const input = tx.getInput(index);
      const prevout = getPrevOut(input);
      const txid = hex.encode(input.txid!);
      const actualAddress = addressCodec.encode(OutScript.decode(prevout.script));
      const output = await regtestOrdinals?.getOutput(`${txid}:${input.index}`);
      const matchingOutput =
        output && output.address === actualAddress && BigInt(output.value) === prevout.amount
          ? output
          : undefined;

      if (address === paymentAddress) {
        const coin = paymentCoins.find((item) => item.txid === txid && item.vout === input.index);
        if (
          !coin?.status.confirmed ||
          BigInt(coin.value) !== prevout.amount ||
          actualAddress !== paymentAddress ||
          !matchingOutput ||
          matchingOutput.inscriptions.length ||
          Object.keys(matchingOutput.runes ?? {}).length ||
          !(await bitcoin.isRegtestFundingAvailable(coin))
        ) {
          throw new Error(`Payment input ${index} is not a confirmed, clean wallet UTXO.`);
        }
      }

      return { index, output: matchingOutput };
    }),
  );
  if (partialListing && !payload.broadcast && !payload.finalize) return inputs;

  const assets = facts.filter(({ output }) => !output || output.inscriptions.length);
  for (const { index, output } of assets) {
    if (!output) {
      throw new Error(`Cannot approve input ${index}: inscription information is unavailable.`);
    }
  }
  if (!assets.length) return inputs;

  const summary = await new btcTransaction.EnhancedPsbt(
    context,
    payload.psbtBase64,
    inputs,
  ).getSummary();
  for (const { index, output } of assets) {
    const reviewInput = summary.inputs[index];
    for (const id of output!.inscriptions) {
      const located = reviewInput.inscriptions.find((inscription) => inscription.id === id);
      const inputOffset = summary.inputs
        .slice(0, index)
        .reduce((sum, input) => sum + input.extendedUtxo.utxo.value, 0);
      let outputOffset = 0;
      const delivered =
        located &&
        summary.outputs.some((destination) => {
          const offset = inputOffset + located.offset - outputOffset;
          outputOffset += destination.amount;
          return (
            'inscriptions' in destination &&
            offset >= 0 &&
            offset < destination.amount &&
            destination.inscriptions.some(
              (inscription) => inscription.id === id && inscription.offset === offset,
            )
          );
        });
      if (summary.inputs.slice(0, index + 1).some((input) => input.prevoutUnknown) || !delivered) {
        throw new Error(
          `Cannot approve input ${index}: inscription ${id} cannot be verified in a transaction output and may be lost to fees.`,
        );
      }
    }
  }
  return inputs;
}
