import { getOrdinalsByAddress, type BtcOrdinal } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';
import useBtcClient from './apiClients/useBtcClient';
import useWalletSelector from './useWalletSelector';

const useOrdinalsByAddress = (address: string) => {
  const { network } = useWalletSelector();
  const btcClient = useBtcClient();

  const fetchOrdinals = async (): Promise<BtcOrdinal[]> => {
    if (!address || (network.type === 'Regtest' && (!network.btcApiUrl || !network.ordApiUrl)))
      return [];
    const ordinals = await getOrdinalsByAddress(btcClient, network.type, address);
    return ordinals.filter((item) => item.id !== undefined);
  };

  const {
    data: ordinals,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['ordinals', network, address],
    queryFn: fetchOrdinals,
  });

  return {
    ordinals,
    isLoading,
    refetch,
  };
};

export default useOrdinalsByAddress;
