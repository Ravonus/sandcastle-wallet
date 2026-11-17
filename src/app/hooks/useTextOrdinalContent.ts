import type { CondensedInscription, Inscription } from '@secretkeylabs/xverse-core';
import { getTextOrdinalContent } from '@secretkeylabs/xverse-core';
import { useQuery } from '@tanstack/react-query';
import PQueue from 'p-queue';
import useWalletSelector from './useWalletSelector';

const queue = new PQueue({ concurrency: 1 });

const useTextOrdinalContent = (ordinal?: Inscription | CondensedInscription) => {
  const { network } = useWalletSelector();
  const { data: textContent } = useQuery({
    enabled:
      !!ordinal?.id &&
      (network.type !== 'Regtest' ||
        /^(text\/[^;]+|application\/json)(;|$)/i.test(ordinal.content_type ?? '')),
    queryKey: ['ordinal-text', ordinal?.id, network],
    queryFn: async () => {
      if (!ordinal?.id) return;
      return queue.add(() => getTextOrdinalContent(network.type, ordinal.id, network.ordApiUrl));
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });

  return textContent?.toString();
};

export default useTextOrdinalContent;
