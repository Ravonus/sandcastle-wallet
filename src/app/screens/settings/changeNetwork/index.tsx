import { normalizeRegtestEndpoint, validateRegtestEndpoints } from '@common/utils/regtestEndpoints';
import BottomBar from '@components/tabBar';
import TopRow from '@components/topRow';
import useWalletReducer from '@hooks/useWalletReducer';
import useWalletSelector from '@hooks/useWalletSelector';
import {
  defaultMainnet,
  defaultRegtest,
  defaultSignet,
  defaultTestnet,
  defaultTestnet4,
  initialNetworksList,
  type SettingsNetwork,
} from '@secretkeylabs/xverse-core';
import Button from '@ui-library/button';
import { isValidBtcApi, isValidStacksApi } from '@utils/helper';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import NetworkRow from './networkRow';
import NodeInput from './nodeInput';

const Container = styled.div`
  ${(props) => props.theme.typography.body_medium_m}
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: 16px;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const Title = styled.h1((props) => ({
  ...props.theme.typography.headline_xs,
  paddingTop: props.theme.space.xs,
  paddingBottom: props.theme.space.s,
}));

const ButtonContainer = styled.div`
  margin: ${(props) => props.theme.space.m};
`;

const NodeInputsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${(props) => props.theme.space.s};
  margin-top: ${(props) => props.theme.space.s};
`;

type NodeInputKey = keyof Pick<
  SettingsNetwork,
  'address' | 'btcApiUrl' | 'fallbackBtcApiUrl' | 'ordApiUrl'
>;
type NodeField = { key: NodeInputKey; labelKey: string; placeholder?: string };
const nodeInputs: NodeField[] = [
  { key: 'address', labelKey: 'STACKS_URL' },
  { key: 'btcApiUrl', labelKey: 'BTC_URL' },
  { key: 'fallbackBtcApiUrl', labelKey: 'FALLBACK_BTC_URL' },
];

const regtestInputs: NodeField[] = [
  { key: 'btcApiUrl', labelKey: 'REGTEST_BTC_URL', placeholder: 'http://localhost:3002/api' },
  { key: 'ordApiUrl', labelKey: 'REGTEST_ORD_URL', placeholder: 'http://localhost:80' },
];

type NodeInputErrors = Record<NodeInputKey, string>;
const initialNodeErrors: NodeInputErrors = {
  address: '',
  btcApiUrl: '',
  fallbackBtcApiUrl: '',
  ordApiUrl: '',
};

function ChangeNetworkScreen() {
  const { t } = useTranslation('translation', { keyPrefix: 'SETTING_SCREEN' });
  const navigate = useNavigate();
  const { changeNetwork } = useWalletReducer();
  const { network, savedNetworks, exposeLocalRegtestConnector } = useWalletSelector();
  const [isChangingNetwork, setIsChangingNetwork] = useState(false);
  const [formErrors, setFormErrors] = useState<NodeInputErrors>(initialNodeErrors);
  const [formInputs, setFormInputs] = useState<SettingsNetwork>(network);
  const [exposeConnector, setExposeConnector] = useState(exposeLocalRegtestConnector);
  const [canSaveAnyway, setCanSaveAnyway] = useState(false);
  const [saveError, setSaveError] = useState('');
  const isRegtest = formInputs.type === 'Regtest';

  const handleBackButtonClick = () => {
    navigate('/settings');
  };

  const onNetworkSelected = (networkSelected: SettingsNetwork) => {
    if (networkSelected.type === formInputs.type) {
      return;
    }
    setCanSaveAnyway(false);
    setFormInputs(networkSelected);
    setFormErrors(initialNodeErrors);
  };

  // TODO should validate required fields on change
  const onChangeCreator = (key: NodeInputKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setCanSaveAnyway(false);
    setFormErrors((prevErrors) => ({
      ...prevErrors,
      [key]: '',
    }));
    setFormInputs((prevInputs) => ({
      ...prevInputs,
      [key]: event.target.value,
    }));
  };

  const onClearCreator = (key: NodeInputKey) => () => {
    setCanSaveAnyway(false);
    setFormErrors((prevErrors) => ({
      ...prevErrors,
      [key]: '',
    }));
    setFormInputs((prevInputs) => ({
      ...prevInputs,
      [key]: '',
    }));
  };

  const onResetCreator = (key: NodeInputKey) => () => {
    setCanSaveAnyway(false);
    setFormErrors((prevErrors) => ({
      ...prevErrors,
      [key]: '',
    }));
    setFormInputs((prevInputs) => ({
      ...prevInputs,
      [key]: initialNetworksList.find((n) => n.type === formInputs.type)?.[key],
    }));
  };

  const onSubmit = async () => {
    setIsChangingNetwork(true);
    setSaveError('');
    if (isRegtest) {
      const btcApiUrl = normalizeRegtestEndpoint(formInputs.btcApiUrl, 'bitcoin');
      const ordApiUrl = normalizeRegtestEndpoint(formInputs.ordApiUrl ?? '', 'ord');
      if (btcApiUrl === undefined || ordApiUrl === undefined) {
        setFormErrors({
          ...initialNodeErrors,
          btcApiUrl: btcApiUrl === undefined ? t('INVALID_URL') : '',
          ordApiUrl: ordApiUrl === undefined ? t('INVALID_URL') : '',
        });
        setCanSaveAnyway(false);
        setIsChangingNetwork(false);
        return;
      }
      setFormInputs((previous) => ({ ...previous, btcApiUrl, ordApiUrl }));

      const settings = {
        ...formInputs,
        address: '',
        fallbackBtcApiUrl: '',
        btcApiUrl,
        ordApiUrl,
      };

      try {
        const { bitcoin, ord, wrongGenesis, warning } = await validateRegtestEndpoints(settings);
        if (wrongGenesis) {
          setFormErrors({ ...initialNodeErrors, ordApiUrl: t('REGTEST_WRONG_GENESIS') });
          setCanSaveAnyway(false);
          return;
        }
        if (!canSaveAnyway && (!bitcoin || !ord)) {
          setFormErrors({
            ...initialNodeErrors,
            btcApiUrl: bitcoin ? '' : t(settings.btcApiUrl ? 'INVALID_URL' : 'REQUIRED'),
            ordApiUrl: ord ? '' : t(settings.ordApiUrl ? 'INVALID_URL' : 'REQUIRED'),
          });
          setCanSaveAnyway(true);
          return;
        }
        await changeNetwork(settings, exposeConnector);
        if (warning) toast(t(warning), { duration: 8000 });
        navigate('/settings');
      } catch {
        setSaveError(t('NETWORK_SAVE_FAILED'));
      } finally {
        setIsChangingNetwork(false);
      }
      return;
    }

    // TODO use formik/yup for all validation if form gets more complex
    // validate required fields
    if (!formInputs.address) {
      setFormErrors((prevErrors) => ({
        ...prevErrors,
        address: t('REQUIRED'),
      }));
      setIsChangingNetwork(false);
      return;
    }

    if (!formInputs.btcApiUrl) {
      setFormErrors((prevErrors) => ({
        ...prevErrors,
        btcApiUrl: t('REQUIRED'),
      }));
      setIsChangingNetwork(false);
      return;
    }

    const isChangedStacksUrl = formInputs.address !== network.address;
    const isChangedBtcApiUrl = formInputs.btcApiUrl !== network.btcApiUrl;
    const isChangedFallbackBtcApiUrl = formInputs.fallbackBtcApiUrl !== network.fallbackBtcApiUrl;

    // validate against server if inputs were changed
    const [isValidStacksUrl, isValidBtcApiUrl, isValidFallbackBtcApiUrl] = await Promise.all([
      !isChangedStacksUrl || isValidStacksApi(formInputs.address, formInputs.type),
      !isChangedBtcApiUrl || isValidBtcApi(formInputs.btcApiUrl, formInputs.type),
      !formInputs.fallbackBtcApiUrl ||
        !isChangedFallbackBtcApiUrl ||
        isValidBtcApi(formInputs.fallbackBtcApiUrl, formInputs.type),
    ]);

    if (isValidStacksUrl && isValidBtcApiUrl && isValidFallbackBtcApiUrl) {
      await changeNetwork(formInputs);
      navigate('/settings');
    } else {
      setFormErrors({
        address: !isValidStacksUrl ? t('INVALID_URL') : '',
        btcApiUrl: !isValidBtcApiUrl ? t('INVALID_URL') : '',
        ordApiUrl: '',
        fallbackBtcApiUrl: !isValidFallbackBtcApiUrl ? t('INVALID_URL') : '',
      });
      setIsChangingNetwork(false);
    }
  };

  const savedMainnet = savedNetworks.find((n) => n.type === 'Mainnet');
  const savedTestnet = savedNetworks.find((n) => n.type === 'Testnet');
  const savedTestnet4 = savedNetworks.find((n) => n.type === 'Testnet4');
  const savedRegtest = savedNetworks.find((n) => n.type === 'Regtest');
  const savedSignet = savedNetworks.find((n) => n.type === 'Signet');

  return (
    <>
      <TopRow onClick={handleBackButtonClick} />
      <Container>
        <Title>{t('NETWORK')}</Title>
        <NetworkRow
          network={savedMainnet || defaultMainnet}
          isSelected={formInputs.type === 'Mainnet'}
          onNetworkSelected={onNetworkSelected}
          disabled={isChangingNetwork}
          showDivider
        />
        <NetworkRow
          network={savedTestnet || defaultTestnet}
          isSelected={formInputs.type === 'Testnet'}
          onNetworkSelected={onNetworkSelected}
          disabled={isChangingNetwork}
          showDivider
        />
        <NetworkRow
          network={savedTestnet4 || defaultTestnet4}
          isSelected={formInputs.type === 'Testnet4'}
          onNetworkSelected={onNetworkSelected}
          disabled={isChangingNetwork}
          showDivider
        />
        <NetworkRow
          network={savedSignet || defaultSignet}
          isSelected={formInputs.type === 'Signet'}
          onNetworkSelected={onNetworkSelected}
          disabled={isChangingNetwork}
          showDivider
        />
        <NetworkRow
          network={savedRegtest || defaultRegtest}
          isSelected={formInputs.type === 'Regtest'}
          onNetworkSelected={onNetworkSelected}
          disabled={isChangingNetwork}
          showDivider={false}
        />
        <NodeInputsContainer>
          {(isRegtest ? regtestInputs : nodeInputs).map(({ key, labelKey, placeholder }) => (
            <NodeInput
              key={key}
              label={t(labelKey)}
              onChange={onChangeCreator(key)}
              placeholder={placeholder}
              value={formInputs[key] ?? ''}
              onClear={onClearCreator(key)}
              onReset={onResetCreator(key)}
              error={formErrors[key]}
              disabled={isChangingNetwork}
            />
          ))}
          {isRegtest && (
            <label>
              <input
                type="checkbox"
                checked={exposeConnector}
                disabled={isChangingNetwork}
                onChange={(event) => setExposeConnector(event.target.checked)}
              />{' '}
              {t('REGTEST_CONNECTOR')}
            </label>
          )}
          {saveError && <p role="alert">{saveError}</p>}
        </NodeInputsContainer>
      </Container>
      <ButtonContainer>
        <Button
          title={t(canSaveAnyway ? 'SAVE_ANYWAY' : 'SAVE')}
          onClick={onSubmit}
          loading={isChangingNetwork}
          disabled={isChangingNetwork}
        />
      </ButtonContainer>
      <BottomBar tab="settings" />
    </>
  );
}

export default ChangeNetworkScreen;
