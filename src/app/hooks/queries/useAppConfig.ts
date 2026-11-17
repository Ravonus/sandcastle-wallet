import useWalletSelector from '@hooks/useWalletSelector';
import { getXverseApiClient } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';

const useAppConfig = () => {
  const { network } = useWalletSelector();

  return useQuery({
    queryKey: ['app-config', network],
    queryFn: async () => {
      const response = await getXverseApiClient(network).getAppConfig();
      return response;
    },
  });
};

export default useAppConfig;
