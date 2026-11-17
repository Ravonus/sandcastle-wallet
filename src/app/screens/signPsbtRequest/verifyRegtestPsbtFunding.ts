import getBitcoinClients from '@common/utils/bitcoinClients';
import { base64, hex } from '@scure/base';
import { Address, OutScript, Transaction } from '@scure/btc-signer';
import { getPrevOut } from '@scure/btc-signer/utxo';
import {
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
  payload: { psbtBase64: string; inputsToSign?: InputToSign[] },
  settings: SettingsNetwork,
): Promise<InputToSign[]> {
  const tx = Transaction.fromPSBT(base64.decode(payload.psbtBase64), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
  });
  const inputs = payload.inputsToSign ?? inferOwnedInputs(tx, context);
  const paymentIndexes = inputs
    .filter(({ address }) => address === context.paymentAddress.address)
    .flatMap(({ signingIndexes }) => signingIndexes);
  if (!paymentIndexes.length) return inputs;

  const { bitcoin, regtestOrdinals } = getBitcoinClients(settings);
  const coins = await bitcoin.getUnspentUtxos(context.paymentAddress.address);
  const available = new Map(coins.map((coin) => [`${coin.txid}:${coin.vout}`, coin]));
  const paymentCodec = Address(getBtcNetworkDefinition('Regtest'));
  const paymentScript = hex.encode(
    OutScript.encode(paymentCodec.decode(context.paymentAddress.address)),
  );
  for (const index of paymentIndexes) {
    const input = tx.getInput(index);
    const prevout = getPrevOut(input);
    const coin = available.get(`${hex.encode(input.txid!)}:${input.index}`);
    if (
      !coin ||
      prevout.amount !== BigInt(coin.value) ||
      hex.encode(prevout.script) !== paymentScript ||
      (await regtestOrdinals?.getSpendStatus(coin)) !== 'clean'
    ) {
      throw new Error(`Payment input ${index} is not a confirmed, clean wallet UTXO.`);
    }
  }
  return inputs;
}
