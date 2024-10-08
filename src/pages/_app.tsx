import 'degen/styles';
import '../styles/globals.scss';

import { ChakraProvider } from '@chakra-ui/react';
import { setUser } from '@sentry/nextjs';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { SessionProvider } from 'next-auth/react';
import NextTopLoader from 'nextjs-toploader';
import posthog from 'posthog-js';
import { PostHogProvider, usePostHog } from 'posthog-js/react';
import React, { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

import { FeatureModal } from '@/components/modals/FeatureModal';
import { SolanaWalletProvider } from '@/context/SolanaWallet';
import { latestActiveSlugQuery } from '@/features/sponsor-dashboard';
import { useUpdateUser, useUser } from '@/store/user';
import { fontMono, fontSans, fontSerif } from '@/theme/fonts';
import { getURL } from '@/utils/validUrl';

import theme from '../config/chakra.config';

// Chakra / Next/font don't play well in config.ts file for the theme. So we extend the theme here. (only the fonts)
const extendThemeWithNextFonts = {
  ...theme,
  fonts: {
    heading: fontSans.style.fontFamily,
    body: fontSans.style.fontFamily,
  },
};

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: `${getURL()}ingest`,
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') posthog.debug();
    },
  });
}

const queryClient = new QueryClient();

function MyApp({ Component, pageProps }: any) {
  const router = useRouter();
  const { user, refetchUser } = useUser();
  const updateUser = useUpdateUser();
  const posthog = usePostHog();

  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);

  const { data: latestActiveSlug } = useQuery(
    latestActiveSlugQuery(
      !!user?.currentSponsorId &&
        user.featureModalShown === false &&
        !router.pathname.includes('dashboard'),
    ),
  );

  useEffect(() => {
    const handleRouteChange = () => posthog?.capture('$pageview');
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events, posthog]);

  useEffect(() => {
    refetchUser();
  }, [refetchUser]);

  useEffect(() => {
    if (router.query.loginState === 'signedIn' && user) {
      posthog.identify(user.email);
      setUser({ id: user.id, email: user.email });
      const url = new URL(window.location.href);
      url.searchParams.delete('loginState');
      window.history.replaceState(null, '', url.href);
    }
  }, [router.query.loginState, user, posthog]);

  useEffect(() => {
    const updateFeatureModalShown = async () => {
      if (
        user &&
        user.featureModalShown === false &&
        user.currentSponsorId &&
        !router.pathname.includes('dashboard') &&
        latestActiveSlug
      ) {
        setIsFeatureModalOpen(true);
        await updateUser.mutateAsync({ featureModalShown: true });
      }
    };

    updateFeatureModalShown();
  }, [user, router.pathname, updateUser, latestActiveSlug]);

  const handleFeatureClose = () => {
    setIsFeatureModalOpen(false);
  };

  return (
    <>
      <NextTopLoader color="#6366F1" showSpinner={false} />
      <Component {...pageProps} key={router.asPath} />
      <Toaster position="bottom-center" richColors />
      <FeatureModal
        latestActiveBountySlug={latestActiveSlug}
        isOpen={isFeatureModalOpen}
        onClose={handleFeatureClose}
      />
    </>
  );
}

function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <style jsx global>{`
        :root {
          --font-sans: ${fontSans.style.fontFamily};
          --font-serif: ${fontSerif.style.fontFamily};
          --font-mono: ${fontMono.style.fontFamily};
        }
      `}</style>
      <SolanaWalletProvider>
        <PostHogProvider client={posthog}>
          <SessionProvider session={session}>
            <ChakraProvider theme={extendThemeWithNextFonts}>
              <MyApp Component={Component} pageProps={pageProps} />
            </ChakraProvider>
          </SessionProvider>
        </PostHogProvider>
      </SolanaWalletProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
