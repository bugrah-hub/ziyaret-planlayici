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

## Takıldığın yerde

Herhangi bir adımda hata alırsan, ekran görüntüsü veya hata mesajının tamamını buraya yapıştır, birlikte çözeriz.
