import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')

articles_data = [
    {"code": "000001", "description": "Računovodstvo - Contabilita`", "unitMeasure": "kos", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000002", "description": "Najem sedeža - Sede legale", "unitMeasure": "kos", "priceWithoutVAT": 50.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000003", "description": "Uporaba programa - Utilizzo gestionale", "unitMeasure": "kos", "priceWithoutVAT": 15.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000004", "description": "Uvajanje v delo - Formazione", "unitMeasure": "kos", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000005", "description": "Intrastat", "unitMeasure": "kos", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000006", "description": "Letna poročila in davčni obračun - Bilanci di chiusura", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000007", "description": "Poslovno svetovanje - Consulenza", "unitMeasure": "kos", "priceWithoutVAT": 65.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000008", "description": "Obračun drugih osebnih prejemkov - Elaborazione di redditi di persona fisica", "unitMeasure": "kos", "priceWithoutVAT": 10.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000009", "description": "Priprava pogodbe - Preparazione del contratto", "unitMeasure": "kos", "priceWithoutVAT": 15.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000010", "description": "Poročanje UJP račun", "unitMeasure": "kos", "priceWithoutVAT": 5.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000011", "description": "Inšpekcijsko zastopanje - Assistenza accertamento", "unitMeasure": "kos", "priceWithoutVAT": 100.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000012", "description": "Pridobitev ID za DDV - Richiesta P.IVA", "unitMeasure": "kos", "priceWithoutVAT": 1000.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000013", "description": "Pridobitev davčne številke/EMŠO - Ottenimento del codice fiscale/codice anagrafico", "unitMeasure": "kos", "priceWithoutVAT": 50.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000014", "description": "Pridobivanje/priprava dokumentacije - Ottenimento di documenti", "unitMeasure": "kos", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000015", "description": "Priprava vmesnih bilanc - Praparazione di bilanci provisori", "unitMeasure": "kos", "priceWithoutVAT": 50.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000016", "description": "M4 - poročanje podatkov ZPIZ", "unitMeasure": "kos", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000017", "description": "Opravljanje plačilnega prometa/pomoč - Supporto WEB banking", "unitMeasure": "kos", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000018", "description": "Priprava izdanega računa - Preparazione della fattura", "unitMeasure": "kos", "priceWithoutVAT": 10.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000019", "description": "Priprava potnega naloga - Preparazione della nota di trasferta", "unitMeasure": "kos", "priceWithoutVAT": 10.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000020", "description": "Prijava/odjava v zavarovanje - Assicurazione dipendenti", "unitMeasure": "kos", "priceWithoutVAT": 15.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000021", "description": "Poročanje državnim institucijam - Dichiarazioni ad enti nazionali", "unitMeasure": "kos", "priceWithoutVAT": 65.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000022", "description": "Zahtevek za refundacijo ZZZS - Richiesta rimborso contributi malattia", "unitMeasure": "kos", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000023", "description": "Drugo", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000024", "description": "Ustanovitev podjetja - Costituzione societa'", "unitMeasure": "kos", "priceWithoutVAT": 1000.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000025", "description": "Najemnina - Affitto", "unitMeasure": "kos", "priceWithoutVAT": 1.00, "vatPercentage": 0, "tariffCode": ""},
    {"code": "000026", "description": "Prodajna provizija 5%", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000027", "description": "Prodajna provizija 2%", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000028", "description": "Zahtevek za izdajo A1 - Richiesta A1", "unitMeasure": "kos", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000029", "description": "Najemnina oproščeno - Affitto essenzione IVA", "unitMeasure": "kos", "priceWithoutVAT": 1.00, "vatPercentage": 0, "tariffCode": ""},
    {"code": "000030", "description": "Seminar/Skupinsko izobraževanje", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000031", "description": "Sklepi podjetja - Delibere societarie", "unitMeasure": "kos", "priceWithoutVAT": 17.50, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000032", "description": "Revizija ZPIZ podatkov za pokojninsko in invalidsko zavarovanje - Revisione dati INPS da delibera", "unitMeasure": "kos", "priceWithoutVAT": 25.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000033", "description": "Pridobitev delovnega dovoljenja - Ottenimento del permesso di lavoro", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000034", "description": "Storitve v zvezi z interventnim zakonom - Servizi inerenti alla legge di intervento statale", "unitMeasure": "ur", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000035", "description": "Varščina po pogodbi - Cauzione contrattuale", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 0, "tariffCode": ""},
    {"code": "000036", "description": "Prijava dohodkov-dohodnina - Dichiarazione dei redditi", "unitMeasure": "kos", "priceWithoutVAT": 100.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000037", "description": "Vpis elektronskega naslova AJPES - Pratica iscrizione mail AJPES", "unitMeasure": "kos", "priceWithoutVAT": 10.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000038", "description": "Posredovanje opomina - Invio sollecito", "unitMeasure": "kos", "priceWithoutVAT": 5.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000039", "description": "Vloga za znižanje akontacij - Richiesta abbassamento acconti", "unitMeasure": "ur", "priceWithoutVAT": 45.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000040", "description": "Povzetek obračuna dohodkov za zaposlene - Notifica annua dipendenti buste paga", "unitMeasure": "kos", "priceWithoutVAT": 10.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000041", "description": "Vezana knjiga računov (VKR) - Libro fatture elettroniche", "unitMeasure": "kos", "priceWithoutVAT": 9.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000042", "description": "Priprava internega akta za davčno potrjevanje računov - Preparazione atto interno per conferma fiscale fatture elettroniche", "unitMeasure": "kos", "priceWithoutVAT": 18.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000043", "description": "Priprava in vložitev e-izvršbe - Preparazione pignoramento elettronico", "unitMeasure": "kos", "priceWithoutVAT": 50.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "000044", "description": "Prefakturiranje - Rifatturazione", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 22.0, "tariffCode": ""},
    {"code": "100001", "description": "Storitve Razpisi", "unitMeasure": "kos", "priceWithoutVAT": 0.00, "vatPercentage": 22.0, "tariffCode": ""}
]

async def seed_articles():
    """Seed article codes into database"""
    client = AsyncIOMotorClient(MONGO_URL)
    db_name = os.environ.get('DB_NAME', 'test_database')
    db = client[db_name]
    
    # Clear existing articles
    await db.articles.delete_many({})
    
    # Insert articles
    await db.articles.insert_many(articles_data)
    
    print(f"✅ Seeded {len(articles_data)} articles")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_articles())
