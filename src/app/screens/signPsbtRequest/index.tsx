import { assertBitcoinApproval } from '@common/utils/rpc/btc/regtestApproval';
import ConfirmBtcTransaction from '@components/confirmBtcTransaction';
import RequestError from '@components/requests/requestError';
import useSubmitRuneSellPsbt from '@hooks/queries/runes/useSubmitRuneSellPsbt';
import useSelectedAccount from '@hooks/useSelectedAccount';
import useTrackMixPanelPageViewed from '@hooks/useTrackMixPanelPageViewed';
import useWalletSelector from '@hooks/useWalletSelector';
import { SigHash } from '@scure/btc-signer';
import {
  AnalyticsEvents,
  btcTransaction,
  type KeystoneTransport,
  type LedgerTransport,
} from '@secretkeylabs/xverse-core';
import { trackMixPanel } from '@utils/mixpanel';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import useSignPsbt from './useSignPsbt';
import useSignPsbtValidationGate from './useSignPsbtValidationGate';
import { verifyRegtestPsbtFunding } from './verifyRegtestPsbtFunding';

type PSBTSummary = btcTransaction.PsbtSummary;

function SignPsbtRequest() {
  const navigate = useNavigate();
  const selectedAccount = useSelectedAccount();
  const { network } = useWalletSelector();
  const { t } = useTranslation('translation', { keyPrefix: 'CONFIRM_TRANSACTION' });
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const magicEdenPsbt = searchParams.get('magicEdenPsbt');
  const runeId = searchParams.get('runeId');
  const [isLoading, setIsLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [summary, setSummary] = useState<PSBTSummary | undefined>();
  const { payload, parsedPsbt, confirmSignPsbt, cancelSignPsbt, onCloseError, params, txnContext } =
    useSignPsbt();
  const { validationError, setValidationError } = useSignPsbtValidationGate({
    payload,
    parsedPsbt,
  });
  // extend in future if necessary
  const isInAppPsbt = magicEdenPsbt && runeId;

  useTrackMixPanelPageViewed();

  const { submitRuneSellPsbt } = useSubmitRuneSellPsbt();

  useEffect(() => {
    if (!parsedPsbt) return;

    let disposed = false;
    setIsLoading(true);
    assertBitcoinApproval(params)
      .then(() => parsedPsbt.getSummary())
      // TODO move this block into useSignPsbt
      .then(async (txSummary) => {
        if (disposed) return;
        setSummary(txSummary);
        setIsLoading(false);
      })
      .catch((err) => {
        if (disposed) return;
        setIsLoading(false);
        setValidationError({
          error: err instanceof Error ? err.message : String(err),
          errorTitle: t('PSBT_CANT_PARSE_ERROR_TITLE'),
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      disposed = true;
    };
  }, [parsedPsbt, params]);

  const onConfirm = async (options?: {
    ledgerTransport?: LedgerTransport;
    keystoneTransport?: KeystoneTransport;
  }) => {
    if (!parsedPsbt || validationError || !summary) return;

    setIsSigning(true);
    try {
      await assertBitcoinApproval(params);
      if (payload.broadcast || payload.finalize) parsedPsbt.assertCanFinalize();
      let psbtToSign = parsedPsbt;
      if (txnContext.network === 'Regtest') {
        const inputs = await verifyRegtestPsbtFunding(txnContext, payload, network);
        if (payload.inputsToSign === undefined) {
          psbtToSign = new btcTransaction.EnhancedPsbt(txnContext, payload.psbtBase64, inputs);
        }
        await assertBitcoinApproval(params);
      }
      const signedPsbt = await psbtToSign.getSignedPsbtBase64({
        finalize: payload.broadcast || payload.finalize,
        ...options,
      });
      const response = await confirmSignPsbt(signedPsbt);
      trackMixPanel(AnalyticsEvents.TransactionConfirmed, {
        protocol: 'bitcoin',
        action: 'sign-psbt',
        wallet_type: selectedAccount?.accountType || 'software',
      });
      const transport = options?.ledgerTransport ?? options?.keystoneTransport;
      if (transport) {
        await transport.close();
      }
      if (signedPsbt && magicEdenPsbt && runeId) {
        return await submitRuneSellPsbt(signedPsbt, location.state.selectedRune?.name ?? '')
          .then((res) => {
            if (res.orderIds) {
              navigate('/tx-status', {
                state: {
                  runeListed: location.state.selectedRune,
                },
              });
            }
          })
          .catch((_) => {
            navigate('/tx-status', {
              state: {
                txid: '',
                error: '',
                browserTx: true,
              },
            });
          });
      }
      if (payload.broadcast) {
        navigate('/tx-status', {
          state: {
            txid: response?.txId,
            currency: 'BTC',
            error: '',
            browserTx: true,
          },
        });
      } else {
        window.close();
      }
    } catch (err) {
      setIsSigning(false);
      if (err instanceof Error) {
        setValidationError({
          errorTitle: t('PSBT_CANT_SIGN_ERROR_TITLE'),
          error: err.message,
        });
      }
    }
    setIsSigning(false);
  };

  const onCancel = () => {
    if (magicEdenPsbt) {
      navigate(`/coinDashboard/FT?ftKey=${runeId}&protocol=runes`);
    } else {
      cancelSignPsbt();
      window.close();
    }
  };

  const onCloseClick = () => {
    onCloseError(validationError?.error || '');
    window.close();
  };

  if (validationError) {
    return (
      <RequestError
        error={validationError.error}
        errorTitle={validationError.errorTitle}
        onClose={onCloseClick}
        textAlignment={validationError.alignment}
      />
    );
  }

  const incompleteSingle =
    txnContext.network === 'Regtest' && summary?.hasSigHashSingle && !summary.isFinal;
  const committedPayments = incompleteSingle
    ? summary.inputs.flatMap((input, index) => {
        const payout = summary.outputs[index];
        if (
          !input.walletWillSign ||
          input.sigHash === undefined ||
          (input.sigHash & SigHash.SINGLE) !== SigHash.SINGLE ||
          payout?.type !== 'address'
        )
          return [];
        return [
          t('REGTEST_SINGLE_PAYOUT', {
            outpoint: input.extendedUtxo.outpoint,
            amount: payout.amount,
            address: payout.address,
          }),
        ];
      })
    : [];
  const reviewNotice = incompleteSingle
    ? {
        variant: 'warning' as const,
        bodyText: [t('REGTEST_SINGLE_WARNING'), ...committedPayments].join(' '),
      }
    : undefined;

  const purchaseAsset = params.get('purchaseOutpoint');
  const purchaseInput =
    purchaseAsset &&
    summary?.inputs.find(
      (input) => !input.prevoutUnknown && input.extendedUtxo.outpoint === purchaseAsset,
    );
  const verifiedPurchase =
    purchaseInput &&
    summary?.outputs.some(
      (output) =>
        output.type === 'address' &&
        output.address === selectedAccount.ordinalsAddress &&
        output.inscriptions.some(({ id }) =>
          purchaseInput.inscriptions.some((input) => input.id === id),
        ),
    );

  return (
    <ConfirmBtcTransaction
      summary={summary}
      customCallout={reviewNotice}
      title={verifiedPurchase ? t('REGTEST_PURCHASE_TITLE') : undefined}
      isLoading={isLoading}
      isSubmitting={isSigning}
      isBroadcast={payload.broadcast}
      confirmText={t('CONFIRM')}
      cancelText={t('CANCEL')}
      onCancel={onCancel}
      onConfirm={onConfirm}
      onBackClick={
        isInAppPsbt
          ? () => navigate(`/list-rune/${runeId}`, { state: location.state.listRunesState })
          : undefined
      }
      hideBottomBar
      showAccountHeader={!isInAppPsbt}
    />
  );
}

export default SignPsbtRequest;
