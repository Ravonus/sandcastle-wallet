import useNetworkSelector from '@hooks/useNetwork';
import useSelectedAccount from '@hooks/useSelectedAccount';
import useWalletSelector from '@hooks/useWalletSelector';
import { fetchDelegationState } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';

const useDelegationState = () => {
  const { stxAddress } = useSelectedAccount();
  const { network } = useWalletSelector();
  const selectedNetwork = useNetworkSelector();

  return useQuery({
    queryKey: ['stacking-delegation-state', selectedNetwork, stxAddress, network.type],
    queryFn: () =>
      network.type === 'Regtest' ? null : fetchDelegationState(stxAddress, selectedNetwork),
    enabled: Boolean(stxAddress),
  });
};

export default useDelegationState;
