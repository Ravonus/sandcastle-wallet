import Button from '@ui-library/button';
import { saveIsTermsAccepted } from '@utils/localStorage';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';

const Container = styled.div((props) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: props.theme.spacing(8),
  paddingTop: props.theme.spacing(20),
  paddingBottom: props.theme.spacing(32),
  justifyContent: 'space-between',
}));

const Title = styled.h1((props) => ({
  ...props.theme.bold_tile_text,
  color: props.theme.colors.white_0,
}));

const Notice = styled.p((props) => ({
  ...props.theme.typography.body_m,
  color: props.theme.colors.white_200,
  marginTop: props.theme.spacing(8),
}));

const LicenseLink = styled.a((props) => ({
  ...props.theme.typography.body_medium_m,
  display: 'block',
  marginTop: props.theme.spacing(8),
  color: props.theme.colors.white_0,
}));

function Legal() {
  const { t } = useTranslation('translation', { keyPrefix: 'LEGAL_SCREEN' });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleLegalAccept = () => {
    saveIsTermsAccepted(true);
    navigate(searchParams.has('restore') ? '/restoreWallet' : '/backup', { replace: true });
  };

  return (
    <Container>
      <div>
        <Title>{t('SCREEN_TITLE')}</Title>
        <Notice>{t('LICENSE_NOTICE')}</Notice>
        <LicenseLink href={chrome.runtime.getURL('LICENSE')} target="_blank" rel="noreferrer">
          {t('EXTENSION_LICENSE')}
        </LicenseLink>
        <LicenseLink href={chrome.runtime.getURL('LICENSE-core')} target="_blank" rel="noreferrer">
          {t('CORE_LICENSE')}
        </LicenseLink>
      </div>
      <Button title={t('ACCEPT_LEGAL_BUTTON')} onClick={handleLegalAccept} />
    </Container>
  );
}

export default Legal;
