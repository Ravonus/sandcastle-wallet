import { useQuery } from '@tanstack/react-query';
import useBtcClient from './apiClients/useBtcClient';
import useWalletSelector from './useWalletSelector';

export default function useBtcAddressBalance(address: string) {
  const btcClient = useBtcClient();
  const { network } = useWalletSelector();

  const fetchBalance = async () => {
    if (!address || (network.type === 'Regtest' && !network.btcApiUrl)) {
      return null;
    }

    const balance = await btcClient.getBalance(address);
    return {
      address,
      confirmedBalance: balance.finalBalance,
      unconfirmedBalance: balance.unconfirmedBalance,
    };
  };

  return useQuery({
    queryKey: ['btc-address-balance', address, network],
    queryFn: fetchBalance,
    staleTime: 10 * 1000, // 10 secs
    keepPreviousData: true,
  });
}
