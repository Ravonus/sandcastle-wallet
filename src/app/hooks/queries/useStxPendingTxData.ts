import useSelectedAccount from '@hooks/useSelectedAccount';
import useWalletSelector from '@hooks/useWalletSelector';
import { fetchStxPendingTxData, type StxPendingTxData } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';
import useNetworkSelector from '../useNetwork';

const useStxPendingTxData = () => {
  const { stxAddress } = useSelectedAccount();
  const { network } = useWalletSelector();
  const selectedNetwork = useNetworkSelector();
  const result = useQuery({
    queryKey: ['stx-pending-transaction', { stxAddress, selectedNetwork, type: network.type }],
    queryFn: (): Promise<StxPendingTxData> =>
      network.type === 'Regtest'
        ? Promise.resolve({ pendingTransactions: [] })
        : fetchStxPendingTxData(stxAddress, selectedNetwork),
  });
  return result;
};

export default useStxPendingTxData;
