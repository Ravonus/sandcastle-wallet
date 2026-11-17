import BottomBar from '@components/tabBar';
import TopRow from '@components/topRow';
import { Container, SubTitle, Title } from '@screens/settings/index.styles';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

function PrivacyPreferencesScreen() {
  const { t } = useTranslation('translation', { keyPrefix: 'SETTING_SCREEN' });
  const navigate = useNavigate();

  return (
    <>
      <TopRow onClick={() => navigate(-1)} />
      <Container>
        <Title>{t('PRIVACY_PREFERENCES.TITLE')}</Title>
        <SubTitle>{t('PRIVACY_PREFERENCES.DESCRIPTION')}</SubTitle>
      </Container>
      <BottomBar tab="settings" />
    </>
  );
}

export default PrivacyPreferencesScreen;
