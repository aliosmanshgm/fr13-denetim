# FR.13 Emniyet Olaylari Denetim Uygulamasi - Firebase Realtime Database Surumu

Bu paket yalnizca FR.13 denetim kontrol formunun denetim bazinda doldurulmasi icin tasarlanmistir.

## Uygulama kapsami

- Yeni denetim olusturma ve denetime ozel bilgileri kaydetme
- 15 soru / 58 AAD kontrol formu
- Isletme kanit referanslari
- Denetci notu
- AAD degerlendirme sonucu
- Takip / Beklenen Husus
- Hatirlatma tarihi ve takip durumu
- Bekleyen ve gecikmis husus sayaclari/filtreleri
- JSON disa aktarma ve yazdirma
- Firebase E-posta/Sifre girisi
- Firebase Realtime Database kaydi
- Sifresiz / cevrimdisi yerel kullanim

Bulgu sonrasi DÖF, raporlama veya bulgu kapatma sureci bu uygulamanin kapsami disindadir.

## Firebase mimarisi

Uygulama, referans alinan mevcut projenin mantigina uygun olarak Firebase compat SDK kullanir:

- firebase-app-compat.js
- firebase-auth-compat.js
- firebase-database-compat.js
- Authentication: Email/Password
- Veritabani: Realtime Database

Bulut veri yolu:

`fr13_audits/{auditId}`

Her denetimin `responses` alani altinda 58 AAD'ye ait degerlendirme ve notlar tutulur.

## Firebase Console kurulumu

1. Firebase Console'da FR.13 icin yeni ve ayri bir proje olusturun.
2. Project settings > General > Your apps > Web App (`</>`) ile web uygulamasi ekleyin.
3. Build > Authentication > Sign-in method altinda `Email/Password` secenegini etkinlestirin.
4. Authentication > Users bolumunden yalniz kendiniz icin bir kullanici olusturun. Bu e-posta adresinin Google hesabi olmasi gerekmez.
5. Build > Realtime Database > Create Database ile veritabanini olusturun.
6. Realtime Database > Rules alanina `database.rules.json` dosyasindaki kurallari yapistirip yayinlayin.
7. Firebase'in verdigi `firebaseConfig` degerlerini `firebase-config.js` dosyasina yazin. Realtime Database icin `databaseURL` alani mutlaka bulunmalidir.

Not: Parolanizi kaynak koda yazmayin ve ChatGPT ile paylasmayin. Parola Firebase Authentication kullanici kaydinda kalir.

## Ilk asama Realtime Database kurali

Paketle birlikte gelen kural yalniz Firebase Authentication ile giris yapmis kullanicilara FR.13 verisini acik tutar:

```json
{
  "rules": {
    "fr13_audits": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Projede yalniz tek Authentication kullanicisi olacagi icin bu yapi baslangic icin yeterlidir. Istenirse daha sonra kural dogrudan tek Firebase UID'ye de kilitlenebilir.

## firebase-config.js

Firebase Console'dan alinacak deger su formatta girilir:

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "proje-adi.firebaseapp.com",
  databaseURL: "https://proje-adi-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "proje-adi",
  storageBucket: "proje-adi.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

`firebaseConfig` web istemci ayaridir. Service Account, private key veya Admin SDK anahtari bu uygulamada kullanilmaz.

## Cevrimdisi mod

Giris ekranindaki `Sifresiz / Cevrimdisi Devam Et` secenegi Firebase oturumu acmadan uygulamayi calistirir. Bu modda kayitlar tarayicinin `localStorage` alaninda tutulur. Bulut verisine yazilmaz.

## GitHub Pages

Firebase yapilandirmasi tamamlandiktan sonra klasordeki dosyalar GitHub deposunun kokune alinabilir:

- index.html
- styles.css
- app.js
- fr13-data.js
- firebase-config.js

GitHub Pages icin ek bir sunucu veya build islemi gerekmez.

## Bu pakette tanımlanan Firebase projesi

Web App yapılandırması `firebase-config.js` dosyasına işlendi:

- Project ID: `fr13-denetim`
- Auth domain: `fr13-denetim.firebaseapp.com`
- Web App ID: `1:588322878488:web:fd3e481dc25565c333ff6d`
- Realtime Database URL: henüz bekleniyor

Realtime Database URL yapılandırılmıştır: `https://fr13-denetim-default-rtdb.europe-west1.firebasedatabase.app`.

## Tek kullanıcı güvenlik kuralı
Bu proje tek kullanıcı kullanımı için sabit UID ile sınırlandırılmıştır.
Realtime Database > Rules bölümünde `database.rules.json` içeriğini Publish edin.
Yetkili UID: `1PufZpJF1SSp12TiYqMw3hJeYgm2`
