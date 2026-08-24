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


## v7 - Denetim kullanım iyileştirmeleri
- Değerlendirme sonucu tek tık düğmeleriyle seçilir.
- 'Sonraki değerlendirilmemiş' ile sıradaki açık AAD'ye gidilir; Uzaktan/Yerinde filtresine uyar.
- Her ana soru başlığında değerlendirilme, bulgu ve açık takip sayısı gösterilir.
- Üst başlıkta Firebase/yerel kayıt durumunu gösteren global kayıt rozeti bulunur; kayıt hataları görünür uyarıya dönüşür.

## UX v8 - Takip / Beklenen Husus
- Hatırlatma tarihi olmayan açık takipler ayrı "Tarih belirlenmedi" uyarısı alır.
- Denetim özetine "Tarihi Belirlenmemiş" sayacı eklendi.
- Takip filtresine "Tarihi belirlenmemiş" seçeneği eklendi.
- AAD kartına Bugün / Yarın / +3 gün / +7 gün hızlı tarih düğmeleri eklendi.
- AAD kartına tek tıkla Tamamla / Yeniden aç işlemi eklendi.
- Bekleyen İşler tablosunda gecikmiş, bugün ve tarihsiz kayıtlar öncelikli sıralanır.
- Bekleyen İşler tablosundan takip tek tıkla tamamlanabilir.
- Takibin açılış tarihi görünür hale getirildi.

## UX v9 - İnsan Faktörleri ve Otomatik Kayıt

Bu sürümde arayüz; durum farkındalığı, görsel hiyerarşi, taranabilirlik ve düşük bilişsel yük ilkeleriyle yenilenmiştir.

- Üst özet, 8 eşit KPI yerine 3 anlamlı kümede gösterilir: **Denetim İlerlemesi / Değerlendirme / Takip**.
- AAD kartında mevcut değerlendirme sonucu renk yanında açık metin ve sembolle gösterilir.
- Ana soru başlıklarında ilerleme çubuğu bulunur.
- Filtre/arama alanı görev akışına göre gruplanmıştır.
- Otomatik kayıt alanı, son kayıt zamanını ve Firebase bağlantı durumunu görünür gösterir.
- AAD alanlarında her giriş önce anında `localStorage` yedeğine alınır; Firebase yazımı metin girişlerinde yaklaşık 400 ms debounce ile, seçim/değişiklik işlemlerinde yaklaşık 60 ms içinde başlatılır.
- Tarayıcı/sekmeyi kapatma anında mevcut bellek durumu ayrıca senkron olarak yerel yedeğe yazılır.
- Realtime Database `.info/connected` bilgisi kullanılarak `Firebase bağlı / bağlantısı yok` durumu görünür hale getirilmiştir.

### Neler otomatik kaydedilir?

Firebase oturumunda denetim içindeki AAD verileri otomatik kaydedilir:

- İşletme kanıt referansları
- Denetçi notu
- Değerlendirme sonucu
- Takip / beklenen husus metni
- Hatırlatma tarihi
- Takip durumu ve tamamlanma bilgileri

Takip tablosundaki **Tamamla** hızlı işlemi de doğrudan Firebase'e yazılır.

### Neler veri olarak Firebase'e kaydedilmez?

Arama metni, filtre seçimleri, hangi soru başlığının açık/kapalı olduğu ve o anda hangi denetimin seçili olduğu gibi geçici arayüz tercihleri denetim verisinin parçası değildir. Aktif denetim seçimi yalnızca yerel kullanım kolaylığı için tarayıcıda saklanır.

### Denetim üst bilgileri

Yeni denetim oluşturma veya denetim üst bilgilerini değiştirme işlemi modal formdaki **Kaydet** düğmesiyle tamamlanır. Bunun nedeni kullanıcının formu `Vazgeç` ile kapatabilmesine izin vermektir. AAD çalışma alanında ayrıca Kaydet düğmesi yoktur; alanlar otomatik kayıttadır.

### Bağlantı kesilirse

Firebase oturumundayken bir denetim kaydı henüz sunucuya ulaşmadan bağlantı kesilir veya sekme kapanırsa ilgili denetim `pending sync` olarak yerel depoda işaretlenir. Sonraki Firebase girişinde yerel sürümün `updatedAt` değeri buluttaki kayıttan yeniyse sistem bu kaydı otomatik olarak Realtime Database'e eşitler. Böylece kısa bağlantı kesintilerinde manuel "Kaydet" işlemi gerekmez.


## v10 – AAD Akordiyon Arayüzü

- Ana soru akordiyonlarının altında ikinci seviye AAD akordiyonları eklendi.
- AAD kapalıyken kod, Uzaktan/Yerinde, değerlendirme sonucu, takip durumu ve kayıt durumu görünür kalır.
- Kanıt referansı ve denetçi notu girilmişse kapalı başlıkta küçük içerik işaretleri görünür.
- Birden fazla AAD aynı anda açık tutulabilir; başka AAD açıldığında mevcut AAD zorunlu olarak kapanmaz.
- “Sonraki değerlendirilmemiş” ilgili ana soruyu ve AAD'yi otomatik açar.
- AAD içindeki veri girişi sırasında kapalı/özet kayıt göstergesi de “Kaydediliyor / Kaydedildi / Yerel yedek” durumunu yansıtır.
- Ana soru toplu açma düğmesi, ikinci seviye AAD akordiyonlarıyla karışmaması için “Soruları aç / kapat” olarak adlandırıldı.


## v11 - Denetim kaydi yonetimi
- Mevcut denetimler `Denetim bilgileri` penceresinden guncellenebilir.
- Duzenleme modunda `Denetimi Sil` dugmesi gorunur.
- Firebase oturumunda silme, `fr13_audits/{auditId}` kaydini Realtime Database'den kalici olarak kaldirir ve yerel yedegi de temizler.
- Cevrimdisi modda silme yalniz bu cihazdaki yerel kaydi kaldirir; Firebase kaydi etkilenmez.
- Silme islemi oncesinde denetim adi/numarasini gosteren acik bir onay mesaji vardir.

## v12 - Değerlendirme ve bulgu seviyesi güncellemesi

- AAD değerlendirme sonuçları: **Uygun**, **Uygun Değil**, **N/A**, **Sorulmadı**.
- Eski kayıtlar açılırken geriye dönük uyumluluk için `Bulgu -> Uygun Değil`, `Uygulanamaz -> N/A`, `Gözlem -> Sorulmadı` olarak normalize edilir.
- **Uygun Değil** seçildiğinde üç zorunlu bulgu alanı açılır:
  - Bulgu seviyesi: **Seviye 1 / Seviye 2 / Gözlem**
  - Ön Tanımlı Bulgu
  - Bulgu Açıklaması
- Bu üç alan tamamlanmadan AAD, denetim ilerleme hesabında tamamlanmış değerlendirme sayılmaz ve `Değerlendirilmedi / eksik` filtresinde görünür.
- Üst değerlendirme özeti artık Uygun / Uygun Değil / N/A / Sorulmadı sayılarını gösterir.
- Yeni **Uygun Değil / Tespit Özeti** alanı, Seviye 1, Seviye 2 ve Gözlem sayılarını ve ilgili AAD bulgu metinlerini toplu gösterir.
- Tespit özeti satırına tıklanınca ilgili AAD otomatik açılır.
- Firebase Realtime Database veri yolu ve güvenlik kuralları değiştirilmemiştir; yeni alanlar mevcut AAD response kaydına otomatik eklenir.


## v13 - Excel ve PDF dışa aktarma

Denetim üst ekranına Excel ve PDF dışa aktarma seçenekleri eklenmiştir.

- **Excel:** `Denetim Özeti`, `AAD Değerlendirmeleri`, `Tespitler` ve `Takipler` olmak üzere dört çalışma sayfası oluşturur. Tüm 58 AAD ile denetçi notları, kanıt referansları, değerlendirme sonucu, bulgu alanları ve takip bilgileri aktarılır.
- **PDF:** denetim üst bilgileri, ilerleme/değerlendirme özeti, Seviye 1/Seviye 2/Gözlem özeti, açık bekleyen işler ve tüm AAD değerlendirmelerini okunabilir rapor düzeninde oluşturur.
- JSON dışa aktarma ve Yazdır seçenekleri korunmuştur.
- Excel/PDF üretimi tarayıcıda gerçekleşir; yeni bir sunucu bileşeni gerekmez.


## v14 - Denetim çalışma alanı

- Denetim içeriği dört ayrı çalışma görünümüne ayrıldı: **Kontrol Listesi**, **Tespitler**, **Bekleyen İşler**, **Denetim Özeti**.
- Alt menü sticky yapıdadır; ilerleme, tespit ve takip sayıları sürekli görünür.
- Tespit/Bekleyen İş satırından AAD’ye geçildiğinde otomatik olarak Kontrol Listesi açılır.
- Kontrol Listesine geri dönüldüğünde son çalışılan AAD konumu hatırlanır.
- Excel, PDF, JSON ve Yazdır işlemleri **Dışa Aktar** menüsünde toplandı.
- Firebase veri modeli ve kuralları değişmedi.
