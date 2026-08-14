# Configurazione locale di sKey

`Debug.xcconfig` e `Release.xcconfig` includono `Base.xcconfig`, che a sua volta
carica facoltativamente `Secrets.xcconfig`.

Per configurare un checkout nuovo:

1. duplica `Secrets.example.xcconfig` come `Secrets.xcconfig`;
2. inserisci URL e chiave pubblicabile Supabase;
3. verifica in Xcode che Debug e Release siano le Base Configuration del target
   `SKey`;
4. esegui una build senza aggiungere il file dei segreti a Git.

La chiave pubblicabile è destinata ai client e lavora insieme alle policy RLS.
Password SMTP, `service_role` e altri segreti server non devono mai comparire in
questa cartella o nel bundle dell'app.
