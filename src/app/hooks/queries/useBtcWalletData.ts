import useBtcClient from '@hooks/apiClients/useBtcClient';
import useSelectedAccount from '@hooks/useSelectedAccount';
import useWalletSelector from '@hooks/useWalletSelector';
import type { BtcAddressData } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';

const useBtcWalletData = () => {
  const { btcAddress } = useSelectedAccount();
  const btcClient = useBtcClient();
  const { network } = useWalletSelector();

  const fetchBtcWalletData = async () => {
    if (network.type === 'Regtest' && !network.btcApiUrl) return null;
    const btcData: BtcAddressData = await btcClient.getBalance(btcAddress);
    return btcData.finalBalance;
  };

  return useQuery({
    queryKey: ['btc-wallet-data', btcAddress, network],
    queryFn: fetchBtcWalletData,
    enabled: !!btcAddress,
    staleTime: 10 * 1000, // 10 secs
    keepPreviousData: true,
  });
};

export default useBtcWalletData;
