#!/usr/bin/env python3
"""
Adresleri Google Geocoding API ile koordinata çevirir.

KULLANIM (internete açık bir bilgisayarda/sunucuda çalıştırın):
    export GOOGLE_MAPS_API_KEY="senin-api-key"
    python3 geocode.py organizations.csv locations.json

Google Cloud Console'da "Geocoding API" etkinleştirilmiş bir API key gerekir.
https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com

Script kaldığı yerden devam edebilir: locations.json zaten varsa, daha önce
geocode edilmiş kayıtları atlar (aynı isim+adres için tekrar istek atmaz).
Bu sayede 2000+ adreste bağlantı kopsa bile yeniden çalıştırmak güvenlidir.
"""
import csv
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import hashlib

def geocode_address(address, api_key):
    url = "https://maps.googleapis.com/maps/api/geocode/json?" + urllib.parse.urlencode({
        "address": address,
        "key": api_key,
        "region": "tr",
        "language": "tr",
    })
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("status") == "OK" and data.get("results"):
        loc = data["results"][0]["geometry"]["location"]
        formatted = data["results"][0].get("formatted_address", address)
        return loc["lat"], loc["lng"], formatted, data["status"]
    return None, None, None, data.get("status", "UNKNOWN_ERROR")


def row_key(name, address):
    return hashlib.sha1((name + "|" + address).encode("utf-8")).hexdigest()


def main():
    if len(sys.argv) < 3:
        print("Kullanım: python3 geocode.py <input.csv> <output.json>")
        sys.exit(1)

    input_csv = sys.argv[1]
    output_json = sys.argv[2]

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("HATA: GOOGLE_MAPS_API_KEY ortam değişkeni ayarlanmamış.")
        print('export GOOGLE_MAPS_API_KEY="senin-key"')
        sys.exit(1)

    # Var olan sonuçları yükle (kaldığı yerden devam etmek için)
    existing = {}
    if os.path.exists(output_json):
        with open(output_json, "r", encoding="utf-8") as f:
            try:
                prev = json.load(f)
                for item in prev:
                    existing[item["key"]] = item
            except json.JSONDecodeError:
                pass

    results = list(existing.values())
    processed_keys = set(existing.keys())

    with open(input_csv, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    total = len(rows)
    skipped_empty = 0
    newly_geocoded = 0
    failed = 0

    for i, row in enumerate(rows, 1):
        name = (row.get("Organization - Name") or "").strip()
        squad = (row.get("Organization - WQ Squad") or "").strip()
        address = (row.get("Organization - Address") or "").strip()

        if not address:
            skipped_empty += 1
            continue

        key = row_key(name, address)
        if key in processed_keys:
            continue  # already geocoded in a previous run

        lat, lng, formatted, status = geocode_address(address, api_key)

        if lat is None:
            failed += 1
            print(f"[{i}/{total}] BAŞARISIZ ({status}): {name} — {address}")
        else:
            newly_geocoded += 1
            results.append({
                "key": key,
                "name": name,
                "squad": squad,
                "address": address,
                "formatted_address": formatted,
                "lat": lat,
                "lng": lng,
            })
            print(f"[{i}/{total}] OK: {name} -> {lat:.5f},{lng:.5f}")

        processed_keys.add(key)

        # Her 20 kayıtta bir kaydet (kesinti olursa veri kaybolmasın)
        if (newly_geocoded + failed) % 20 == 0:
            with open(output_json, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)

        time.sleep(0.02)  # Google rate limit için küçük bekleme

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("\n--- ÖZET ---")
    print(f"Toplam satır: {total}")
    print(f"Adres boş (atlandı): {skipped_empty}")
    print(f"Yeni geocode edilen: {newly_geocoded}")
    print(f"Başarısız: {failed}")
    print(f"Toplam koordinatlı kayıt: {len(results)}")
    print(f"Çıktı: {output_json}")


if __name__ == "__main__":
    main()
