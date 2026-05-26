import React, { useRef, useEffect, useState } from 'react';
import {
  BackHandler, StatusBar, StyleSheet, View, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { WebViewNavigation } from 'react-native-webview';

const APP_URL = 'http://65.2.45.191:5000';

// JS injected into every page: force all target="_blank" links to open in-app
const INJECTED_JS = `
  (function() {
    function fixLinks() {
      document.querySelectorAll('a[target="_blank"]').forEach(function(a) {
        a.target = '_self';
      });
    }
    fixLinks();
    new MutationObserver(fixLinks).observe(document.body, { childList: true, subtree: true });
  })();
  true;
`;

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const onBack = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [canGoBack]);

  const handleNavigation = (request: WebViewNavigation) => {
    const url = request.url;

    // Always allow the app server
    if (url.startsWith('http://65.2.45.191') || url.startsWith('about:blank')) {
      return true;
    }

    // Allow Google auth pages within the WebView (needed for sign-in redirect)
    if (
      url.startsWith('https://accounts.google.com') ||
      url.startsWith('https://oauth2.googleapis.com') ||
      url.includes('firebaseapp.com/__/auth')
    ) {
      return true;
    }

    // Open everything else (mailto:, tel:, external sites) in the system browser
    Linking.openURL(url).catch(() => {});
    return false;
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, StatusBar.currentHeight ?? 0) }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" translucent={true} />
      <WebView
        ref={webViewRef}
        source={{ uri: APP_URL }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        startInLoadingState
        injectedJavaScript={INJECTED_JS}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#00B386" />
          </View>
        )}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onShouldStartLoadWithRequest={handleNavigation}
        // Prevent window.open() from opening external browser
        onOpenWindow={(e) => {
          const url = e.nativeEvent.targetUrl;
          if (url && webViewRef.current) {
            webViewRef.current.injectJavaScript(`window.location.href = '${url.replace(/'/g, "\\'")}';`);
          }
        }}
        userAgent="PaperPortfolioApp/1.0 Android"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  loader: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f1a',
  },
});
