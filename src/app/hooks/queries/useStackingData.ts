import useSelectedAccount from '@hooks/useSelectedAccount';
import { getStacksInfo, getXverseApiClient, type StackingData } from '@secretkeylabs/xverse-core';
import { useQueries } from '@tanstack/react-query';
import { useCallback } from 'react';
import useWalletSelector from '../useWalletSelector';
import useDelegationState from './useDelegationState';

const useStackingData = () => {
  const { stxAddress } = useSelectedAccount();
  const { network } = useWalletSelector();
  const { data: delegationStateData, isLoading: delegateStateIsLoading } = useDelegationState();

  const xverseApiClient = getXverseApiClient(network);

  const results = useQueries({
    queries: [
      {
        queryKey: ['stacking-core-info', network],
        queryFn: () => (network.type === 'Regtest' ? null : getStacksInfo(network.address)),
      },
      {
        queryKey: ['stacking-pool-info', network.type],
        queryFn: async () => (await xverseApiClient.fetchStackingPoolInfo()) ?? null,
      },
      {
        queryKey: ['pool-stacker-info', stxAddress, network.type],
        queryFn: async () => (await xverseApiClient.fetchPoolStackerInfo(stxAddress)) ?? null,
      },
    ],
  });

  const coreInfoData = results[0].data;
  const poolInfoData = results[1].data;
  const stackerInfoData = results[2].data;

  const isStackingLoading = results.some((result) => result.isLoading) || delegateStateIsLoading;
  const refetchStackingData = useCallback(() => {
    results.forEach((result) => result.refetch());
  }, [results]);

  // Warning: the non-null assertions here are dangerous, as they assume
  // consumers will check the `isStackingLoading` prop returned below before
  // using them. This isn't always the case, and many parts of the code opt for
  // optional chainig of these values despite the types not indicating that
  // optional chaining is necessary.
  const stackingData: StackingData = {
    poolInfo: poolInfoData!,
    delegationInfo: delegationStateData!,
    coreInfo: coreInfoData!,
    stackerInfo: stackerInfoData ?? undefined,
  };

  return {
    isStackingLoading,
    stackingData,
    refetchStackingData,
  };
};

export default useStackingData;
