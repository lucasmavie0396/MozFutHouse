package com.house.mozfut;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWebView();
    }

    private void configureWebView() {
        getBridge().getWebView().post(() -> {
            try {
                WebView webView = getBridge().getWebView();
                WebSettings settings = webView.getSettings();
                // Os embeeds do YouTube/Twitch bloqueiam a reprodução quando o
                // User-Agent não é reconhecido como um navegador comum (o WebView
                // Android envia "Version/4.0" por omissão). Um UA de Chrome Mobile
                // resolve o ecrã preto/vazio nos embeeds.
                settings.setUserAgentString(
                        "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36");
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
            } catch (Exception e) {
                // configuração extra é opcional
            }
        });
    }
}