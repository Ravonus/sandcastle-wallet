import getBitcoinClients from '@common/utils/bitcoinClients';
import useWalletSelector from '../useWalletSelector';

const useBtcClient = () => {
  const { network } = useWalletSelector();
  return getBitcoinClients(network).bitcoin;
};

export default useBtcClient;
