# Ziyaret Planlayıcı — Netlify + Supabase Kurulumu

Bu rehber teknik bilgi gerektirmez, adım adım kopyala-yapıştır şeklindedir.

## 1. Supabase'de ücretsiz veritabanı oluştur

1. https://supabase.com adresine git, "Start your project" ile ücretsiz hesap aç (GitHub veya email ile).
2. "New Project" oluştur. Bir isim ver (örn. `ziyaret-planlayici`), bir veritabanı şifresi belirle (bir yere not al, sonra lazım olacak), bölge olarak Avrupa'ya yakın bir yer seç (örn. Frankfurt).
3. Proje oluşması ~1-2 dakika sürer.
4. Sol menüden **SQL Editor**'a tıkla, "New query" ile boş bir editör aç.
5. Bu paketteki `supabase_schema.sql` dosyasının içeriğini kopyalayıp editöre yapıştır, sağ alttaki **Run** tuşuna bas. "Success" mesajı görmelisin — bu tabloları (organizations, salespeople, visits) oluşturur.

## 2. Müşteri verisini Supabase'e yükle

1. Supabase'de sol menüden **Table Editor**'a git, `organizations` tablosunu seç.
2. Sağ üstte **Insert** yanındaki ok işaretine tıkla → **Import data from CSV**.
3. Bu paketteki `organizations_for_supabase.csv` dosyasını seç ve yükle. 2006 satır yüklenecek, birkaç saniye sürebilir.
4. Yükleme bitince tabloyu kontrol et, satırların göründüğünden emin ol.

> Not: Bu CSV'deki koordinatlar **placeholder** (yaklaşık/rastgele). Gerçek adres konumları için `geocode.py` script'ini bir Google Maps API key ile ayrı çalıştırıp çıkan `locations.json`'ı tekrar CSV'ye çevirip (aynı yöntemle) tabloyu güncellemen gerekir. Bu script'i internete açık herhangi bir bilgisayarda (örn. bir arkadaşının bilgisayarı, ya da online bir Python çalıştırıcı) çalıştırabilirsin — kurulum dosyası gerektirmez, sadece Python.

## 3. Veritabanı bağlantı adresini al

1. Supabase'de sol altta **Project Settings** (dişli ikonu) → **Database**.
2. **Connection string** bölümünde **URI** sekmesini seç, gösterilen adresi kopyala. Şuna benzer:
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
3. `[YOUR-PASSWORD]` yazan yeri, adım 1'de belirlediğin gerçek şifreyle değiştir.
4. Bu tam adresi bir yere kaydet — Netlify kurulumunda lazım olacak.

## 4. Kodu GitHub'a yükle (Netlify'ın kaynağı için gerekli)

1. https://github.com adresinde ücretsiz hesap aç (yoksa).
2. Sağ üstten **New repository**, bir isim ver (örn. `ziyaret-planlayici`), **Create repository**.
3. Açılan sayfada "uploading an existing file" linkine tıkla.
4. Bu pakette `node_modules` klasörü **hariç** tüm dosya ve klasörleri (public/, netlify/, package.json, netlify.toml, vb.) sürükleyip bırak, **Commit changes**.

## 5. Netlify'da siteyi oluştur

1. https://netlify.com adresinde ücretsiz hesap aç, GitHub ile giriş yapabilirsin.
2. **Add new site** → **Import an existing project** → **GitHub** seç, az önce oluşturduğun repo'yu seç.
3. Build ayarları otomatik gelecek (netlify.toml dosyasından okunur), değiştirmene gerek yok. **Deploy site**'a bas.
4. Deploy tamamlanınca (1-2 dakika) **Site settings** → **Environment variables**'a git.
5. **Add a variable**: Key = `DATABASE_URL`, Value = adım 3'te kaydettiğin Supabase bağlantı adresi. Kaydet.
6. **Deploys** sekmesine dön, **Trigger deploy** → **Deploy site** ile yeniden deploy et (yeni ortam değişkeninin etkili olması için gerekli).

## 6. Hazır!

Netlify sana `https://rastgele-isim-12345.netlify.app` gibi bir adres verecek (Site settings'ten kalıcı bir isme de çevirebilirsin, örn. `ziyaret-planlayici.netlify.app`). Bu adresi ekibinle paylaşabilirsin, herkes telefonundan/bilgisayarından açabilir.

## 7. Google Calendar entegrasyonu ("Takvimden Çek" butonu için)

Bu adım, uygulamanın senin Google hesabınla (ve seninle paylaşılan satışçı takvimleriyle) konuşabilmesi için gerekli. Tek seferlik bir kurulum.

### 7a. Google Cloud'da proje ve OAuth Client oluştur

1. https://console.cloud.google.com adresine git, üstteki proje seçiciden **New Project** (ya da varsa mevcut bir projeyi kullan), bir isim ver (örn. `ziyaret-planlayici`), **Create**.
2. Sol üstten arama çubuğuna "Google Calendar API" yaz, çıkan sonuca tıkla, **Enable** butonuna bas.
3. Sol menüden **APIs & Services** → **OAuth consent screen**'e git.
   - User Type: **External** seç, **Create**.
   - App name: `Ziyaret Planlayıcı`, User support email: kendi email'in, Developer contact: kendi email'in. **Save and Continue** ile ilerle (Scopes ve Test users adımlarını boş geçebilirsin, sadece **Save and Continue**'ya bas).
   - Son adımda **Back to Dashboard**.
   - **Test users** adımına geri dönüp kendi Google hesabını (email'ini) test user olarak ekle — bu olmadan giriş yapamayabilirsin.
4. Sol menüden **APIs & Services** → **Credentials**'a git.
   - **Create Credentials** → **OAuth client ID**.
   - Application type: **Web application**.
   - Name: `ziyaret-planlayici-web`.
   - **Authorized redirect URIs** kısmına şunu ekle: `https://developers.google.com/oauthplayground`
   - **Create**'e bas. Açılan pencerede **Client ID** ve **Client Secret** görünecek — ikisini de bir yere kopyala, sonra lazım olacak.

### 7b. Refresh token al (OAuth Playground ile, kod yazmadan)

1. https://developers.google.com/oauthplayground adresine git.
2. Sağ üstteki dişli (⚙️) ikonuna tıkla, **Use your own OAuth credentials** kutusunu işaretle, 7a'da aldığın **Client ID** ve **Client Secret**'ı yapıştır.
3. Sol taraftaki listede **Calendar API v3**'ü bul, açılan alt listeden `https://www.googleapis.com/auth/calendar.readonly` scope'unu seç (kutucuğu işaretle).
4. **Authorize APIs** butonuna bas. Kendi Google hesabınla giriş yap ve izin ver (test user olduğun için "Google doğrulamadı" uyarısı çıkabilir, **Advanced** → **Git (güvenli değil)** ile devam et — bu senin kendi uygulaman olduğu için güvenlidir).
5. Geri Playground'a döneceksin. **Exchange authorization code for tokens** butonuna bas.
6. Sağda çıkan sonuçta **Refresh token** alanındaki uzun kodu kopyala — bu, Netlify'a ekleyeceğin `GOOGLE_REFRESH_TOKEN` değeri.

### 7c. Netlify'a environment variable'ları ekle

1. Netlify'da sitenin **Site settings** → **Environment variables**'a git.
2. Üç değişken ekle:
   - `GOOGLE_CLIENT_ID` = 7a'da aldığın Client ID
   - `GOOGLE_CLIENT_SECRET` = 7a'da aldığın Client Secret
   - `GOOGLE_REFRESH_TOKEN` = 7b'de aldığın refresh token
3. **Deploys** → **Trigger deploy** → **Deploy site** ile yeniden deploy et.

### 7d. Satışçı takvimlerini bağla

1. Supabase SQL Editor'da (ya da uygulama içindeki **Ayarlar** sekmesinden) her satışçının **Google Calendar email**'ini gir (örn. `esra.serin@worqcompany.com`).
2. Bu email'in takviminin, senin (7a'da yetkilendirdiğin) Google hesabınla paylaşılmış olması gerekir — yani o kişi kendi Google Calendar ayarlarından "paylaş" diyip seni eklemiş olmalı, ya da takvim zaten organizasyon içinde herkese görünür olmalı.
3. Uygulamayı aç, tarihi seç, **📅 Takvimden Çek** butonuna bas. Yüksek/orta güvenle eşleşen ziyaretler otomatik günün planına eklenir; emin olunamayanlar **Onay** sekmesinde senin onayını bekler.

## Takıldığın yerde

Herhangi bir adımda hata alırsan, ekran görüntüsü veya hata mesajının tamamını buraya yapıştır, birlikte çözeriz.
