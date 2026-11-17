import useOrdinalsApi from '@hooks/apiClients/useOrdinalsApi';
import useWalletSelector from '@hooks/useWalletSelector';
import { useQuery } from '@tanstack/react-query';

const useInscriptionDetails = (id: string) => {
  const { network } = useWalletSelector();
  const OrdinalsApi = useOrdinalsApi();
  return useQuery({
    queryKey: ['inscription-details', network, id],
    queryFn: async () => (await OrdinalsApi.getInscription(id)) ?? null,
  });
};

export default useInscriptionDetails;
