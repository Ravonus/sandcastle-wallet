import useWalletSelector from '@hooks/useWalletSelector';
import {
  getNftDetail,
  type NftDetailResponse,
  type NonFungibleToken,
} from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';
import { getIdentifier, isBnsCollection } from '@utils/nfts';
import { handleRetries } from '@utils/query';

const useNftDetail = (id: string | NonFungibleToken['identifier']) => {
  const { network } = useWalletSelector();
  const { tokenId, contractAddress, contractName } =
    typeof id === 'string' ? getIdentifier(id) : id;

  const fetchNft = (): Promise<NftDetailResponse | null> =>
    network.type === 'Regtest'
      ? Promise.resolve(null)
      : getNftDetail(tokenId, contractAddress, contractName);

  return useQuery({
    enabled: !!(
      id &&
      tokenId &&
      contractAddress &&
      contractName &&
      !isBnsCollection(`${contractAddress}.${contractName}`)
    ),
    retry: handleRetries,
    queryKey: ['nft-detail', network.type, contractAddress, contractName, tokenId],
    queryFn: fetchNft,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
};

export default useNftDetail;
