import { fetchBtcFeeRate, type BtcFeeResponse } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';
import useWalletSelector from './useWalletSelector';

function useBtcFeeRate() {
  const { network } = useWalletSelector();

  return useQuery<BtcFeeResponse, Error>({
    queryKey: ['btcFeeRate', network],
    queryFn: () => fetchBtcFeeRate(network),
    staleTime: 5 * 60 * 1000, // 5 mins
  });
}

export default useBtcFeeRate;
