const locations = {
  Baringo: ['Kabarnet','Eldama Ravine','Marigat','Mogotio'],
  Bomet: ['Bomet','Sotik','Longisa'],
  Bungoma: ['Bungoma','Webuye','Kimilili','Chwele'],
  Busia: ['Busia','Malaba','Nambale','Port Victoria'],
  'Elgeyo-Marakwet': ['Iten','Kapsowar','Tambach'],
  Embu: ['Embu','Runyenjes','Siakago'],
  Garissa: ['Garissa','Dadaab','Modogashe'],
  'Homa Bay': ['Homa Bay','Mbita','Oyugis','Kendu Bay'],
  Isiolo: ['Isiolo','Merti','Garbatulla'],
  Kajiado: ['Kajiado','Ngong','Kitengela','Ongata Rongai','Loitokitok'],
  Kakamega: ['Kakamega','Mumias','Butere','Malava'],
  Kericho: ['Kericho','Litein','Londiani'],
  Kiambu: ['Kiambu','Thika','Ruiru','Kikuyu','Limuru','Karuri','Githunguri','Juja'],
  Kilifi: ['Kilifi','Malindi','Watamu','Mtwapa','Mariakani'],
  Kirinyaga: ['Kerugoya','Kutus','Wang’uru','Kagio'],
  Kisii: ['Kisii','Ogembo','Suneka'],
  Kisumu: ['Kisumu','Ahero','Maseno','Muhoroni'],
  Kitui: ['Kitui','Mwingi','Mutomo'],
  Kwale: ['Kwale','Ukunda','Diani','Msambweni'],
  Laikipia: ['Nanyuki','Nyahururu','Rumuruti'],
  Lamu: ['Lamu','Mpeketoni','Witu'],
  Machakos: ['Machakos','Athi River','Mlolongo','Kangundo','Tala'],
  Makueni: ['Wote','Makindu','Sultan Hamud','Mtito Andei'],
  Mandera: ['Mandera','Elwak','Rhamu'],
  Marsabit: ['Marsabit','Moyale','Laisamis'],
  Meru: ['Meru','Maua','Nkubu','Timau'],
  Migori: ['Migori','Awendo','Rongo','Kehancha'],
  Mombasa: ['Mombasa','Likoni','Nyali','Changamwe','Kisauni'],
  "Murang'a": ["Murang'a",'Kenol','Kangema','Maragua'],
  Nairobi: ['Nairobi','Westlands','Embakasi','Karen','Ruaraka'],
  Nakuru: ['Nakuru','Naivasha','Gilgil','Molo','Njoro'],
  Nandi: ['Kapsabet','Nandi Hills','Kobujoi'],
  Narok: ['Narok','Kilgoris','Suswa'],
  Nyamira: ['Nyamira','Keroka','Nyansiongo'],
  Nyandarua: ['Ol Kalou','Engineer','Njabini','Ndaragwa'],
  Nyeri: ['Nyeri','Karatina','Othaya','Mukurweini'],
  Samburu: ['Maralal','Archer’s Post','Baragoi'],
  'Siaya': ['Siaya','Bondo','Ugunja','Yala'],
  'Taita-Taveta': ['Mwatate','Voi','Taveta','Wundanyi'],
  'Tana River': ['Hola','Garsen','Madogo'],
  'Tharaka-Nithi': ['Kathwana','Chuka','Chogoria','Marimanti'],
  'Trans Nzoia': ['Kitale','Kiminini','Endebess'],
  'Turkana': ['Lodwar','Kakuma','Lokichogio'],
  'Uasin Gishu': ['Eldoret','Burnt Forest','Turbo'],
  Vihiga: ['Mbale','Luanda','Chavakali'],
  'Wajir': ['Wajir','Habaswein'],
  'West Pokot': ['Kapenguria','Chepareria','Ortum'],
}

export function searchKenyaLocations(type, county, query) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('en')
  if (type === 'counties') return Object.keys(locations)
    .filter((name) => name.toLocaleLowerCase('en').includes(normalizedQuery))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, normalizedQuery ? 12 : 50)
  if (type !== 'towns') return null
  const countyName = Object.keys(locations).find((name) => name.toLocaleLowerCase('en') === String(county || '').trim().toLocaleLowerCase('en'))
  if (!countyName) return []
  return locations[countyName].filter((name) => name.toLocaleLowerCase('en').includes(normalizedQuery)).slice(0, 12)
}
