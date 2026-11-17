import useStacksAPI from '@hooks/apiClients/useStacksApi';
import useSelectedAccount from '@hooks/useSelectedAccount';
import useWalletSelector from '@hooks/useWalletSelector';
import type { StxAddressData } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';

const useStxWalletData = () => {
  const { stxAddress } = useSelectedAccount();
  const { network } = useWalletSelector();
  const StacksAPI = useStacksAPI();
  const fetchStxWalletData = async (): Promise<StxAddressData> => {
    const response = await StacksAPI.getAddressBalance(stxAddress);
    return {
      ...response,
      balance: response.totalBalance,
      locked: response.lockedBalance,
      transactions: [],
    };
  };

  return useQuery({
    queryKey: ['stx-wallet-data', network.type, stxAddress],
    queryFn: fetchStxWalletData,
    enabled: !!stxAddress,
    staleTime: 10 * 1000, // 10 secs
    keepPreviousData: true,
  });
};

export default useStxWalletData;
