# iOS Firebase config

Place your iOS **`GoogleService-Info.plist`** in this folder:

```
client/ios-config/GoogleService-Info.plist
```

Get it from: Firebase Console → Project settings → Add app → **iOS**
(bundle id `in.paperportfolio.app`) → download `GoogleService-Info.plist`.

The Codemagic build (`codemagic.yaml`) copies it into the generated
`client/ios/App/App/` so Google sign-in works on iOS. It's public Firebase
client config (no secrets), safe to commit — just like the Android
`google-services.json`.
