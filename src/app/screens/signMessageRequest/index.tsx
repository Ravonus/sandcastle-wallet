import { MESSAGE_SOURCE, SatsConnectMethods } from '@common/types/message-types';
import { sendPageReply } from '@common/utils/replyTarget';
import { assertBitcoinApproval } from '@common/utils/rpc/btc/regtestApproval';
import { sendSignMessageSuccessResponseMessage } from '@common/utils/rpc/responseMessages/bitcoin';
import { sendUserRejectionMessage } from '@common/utils/rpc/responseMessages/errors';
import AccountHeaderComponent from '@components/accountHeader';
import MessageSigning from '@components/messageSigning';
import RequestError from '@components/requests/requestError';
import { MessageSigningProtocols, type Return } from '@sats-connect/core';
import { finalizeMessageSignature } from '@screens/signatureRequest/utils';
import { bip0322Hash, legacyHash } from '@secretkeylabs/xverse-core';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useSignMessageRequestParams, useSignMessageValidation } from './useSignMessageRequest';

function SignMessageRequest() {
  const { t } = useTranslation('translation');
  const { search } = useLocation();
  const assertApproval = () => assertBitcoinApproval(new URLSearchParams(search));
  const { payload, tabId, requestToken, requestId } = useSignMessageRequestParams();
  const { validationError, setValidationError } = useSignMessageValidation(payload);

  const cancelCallback = () => {
    if (requestToken) {
      finalizeMessageSignature({ requestPayload: requestToken, tabId: +tabId, data: 'cancel' });
    } else {
      sendUserRejectionMessage({
        recipient: +tabId,
        messageId: requestId,
      });
    }
    window.close();
  };

  const onSigned = async (signedMessage) => {
    await assertApproval();
    if (requestToken) {
      const signingMessage = {
        source: MESSAGE_SOURCE,
        method: SatsConnectMethods.signMessageResponse,
        payload: {
          signMessageRequest: requestToken,
          signMessageResponse: signedMessage.signature,
        },
      };
      sendPageReply(+tabId, signingMessage);
    } else {
      const signMessageResult: Return<'signMessage'> = {
        address: payload.address,
        messageHash:
          payload.protocol === MessageSigningProtocols.BIP322
            ? bip0322Hash(payload.message)
            : legacyHash(payload.message).toString('base64'),
        signature: signedMessage.signature,
        protocol: signedMessage.protocol,
      };
      sendSignMessageSuccessResponseMessage({
        recipient: +tabId,
        messageId: requestId,
        result: signMessageResult,
      });
    }
    window.close();
  };

  const onSignedError = (err) => {
    let msg = err;
    if (err instanceof Error) {
      msg = err.message;
      if (msg.includes('Export address is just allowed on specific pages')) {
        msg = t('SIGNATURE_REQUEST.KEYSTONE.CONFIRM.ERROR_SUBTITLE');
      }
      if (msg.includes('UR parsing rejected')) {
        msg = t('SIGNATURE_REQUEST.KEYSTONE.CONFIRM.DENIED.ERROR_SUBTITLE');
      }
      if (msg.includes('mfp does not match')) {
        msg = t('SIGNATURE_REQUEST.KEYSTONE.CONFIRM.NOT_MATCH_MFP');
      }
    }

    setValidationError({ error: msg });
  };

  if (validationError) {
    return <RequestError error={validationError.error} onClose={cancelCallback} />;
  }

  return (
    <MessageSigning
      address={payload.address}
      message={payload.message}
      protocol={payload.protocol as MessageSigningProtocols}
      onSigned={onSigned}
      beforeSign={assertApproval}
      onSignedError={onSignedError}
      onCancel={cancelCallback}
      header={<AccountHeaderComponent disableMenuOption disableAccountSwitch />}
    />
  );
}

export default SignMessageRequest;
