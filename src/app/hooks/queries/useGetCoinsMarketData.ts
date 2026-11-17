import useXverseApi from '@hooks/apiClients/useXverseApi';
import useWalletSelector from '@hooks/useWalletSelector';
import { useQuery } from '@tanstack/react-query';

const useGetCoinsMarketData = (searchId: string) => {
  const xverseApi = useXverseApi();
  const { network } = useWalletSelector();
  const ids = ['bitcoin', 'blockstack'].includes(searchId) ? ['bitcoin', 'blockstack'] : [searchId];

  const queryFn = async () => {
    const response = await xverseApi.getCoinsMarketData(ids);
    return response;
  };

  return useQuery({
    queryKey: ['get-coins-market-data', network.type, ids.join(',')],
    staleTime: 5 * 60 * 1000, // 5 minutes
    queryFn,
    select: (data) => data.find(({ id }) => searchId === id),
  });
};

export default useGetCoinsMarketData;
