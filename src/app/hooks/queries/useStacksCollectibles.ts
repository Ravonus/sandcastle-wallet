import useNetworkSelector from '@hooks/useNetwork';
import useSelectedAccount from '@hooks/useSelectedAccount';
import useWalletSelector from '@hooks/useWalletSelector';
import { getNftCollections, type StacksCollectionList } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';
import { handleRetries } from '@utils/query';

const useStacksCollectibles = (showHiddenOnly?: boolean) => {
  const { stxAddress } = useSelectedAccount();
  const selectedNetwork = useNetworkSelector();
  const { hiddenCollectibleIds, starredCollectibleIds, network } = useWalletSelector();
  const hiddenIds = Object.keys(hiddenCollectibleIds[stxAddress] ?? {});
  const starredIds = starredCollectibleIds[stxAddress]?.map(({ id }) => id);

  const fetchNftCollections = (): Promise<StacksCollectionList> =>
    network.type === 'Regtest'
      ? Promise.resolve({ total_nfts: 0, results: [] })
      : getNftCollections(stxAddress, selectedNetwork, {
          hiddenCollectibleIds: hiddenIds,
          starredCollectibleIds: starredIds,
          showHiddenOnly,
        });

  return useQuery({
    enabled: !!stxAddress,
    retry: handleRetries,
    queryKey: [
      'nft-collection-data',
      network.type,
      stxAddress,
      hiddenIds,
      starredIds,
      showHiddenOnly,
    ],
    queryFn: fetchNftCollections,
    staleTime: 5 * 60 * 1000, // 5mins
    keepPreviousData: true,
  });
};

export default useStacksCollectibles;
