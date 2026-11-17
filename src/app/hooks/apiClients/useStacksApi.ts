import useNetworkSelector from '@hooks/useNetwork';
import { StacksApiProvider } from '@secretkeylabs/xverse-core';
import { useMemo } from 'react';
import useWalletSelector from '../useWalletSelector';

const useStacksAPI = () => {
  const network = useNetworkSelector();
  const { network: bitcoin } = useWalletSelector();

  const StacksAPI = useMemo(
    () =>
      new StacksApiProvider({
        network,
        btcNetwork: bitcoin.type,
      }),
    [network, bitcoin.type],
  );

  return StacksAPI;
};

export default useStacksAPI;
