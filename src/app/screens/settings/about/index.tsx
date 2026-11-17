import TopRow from '@components/topRow';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Container, SubTitle, Title } from '../index.styles';
import SettingComponent from '../settingComponent';

declare const VERSION: string;

function About() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      <TopRow onClick={() => navigate(-1)} />
      <Container>
        <Title>{t('SETTING_SCREEN.ABOUT')}</Title>
        <SubTitle>{t('LEGAL_SCREEN.LICENSE_NOTICE')}</SubTitle>
        <SettingComponent
          text={t('LEGAL_SCREEN.EXTENSION_LICENSE')}
          onClick={() => window.open(chrome.runtime.getURL('LICENSE'))}
          showDivider
        />
        <SettingComponent
          text={t('LEGAL_SCREEN.CORE_LICENSE')}
          onClick={() => window.open(chrome.runtime.getURL('LICENSE-core'))}
          showDivider
        />
        <SettingComponent
          text={t('SETTING_SCREEN.VERSION')}
          textDetail={`${VERSION} (Beta)`}
          showArrow={false}
        />
      </Container>
    </>
  );
}

export default About;
