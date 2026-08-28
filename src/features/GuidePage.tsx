import {
  ArrowRightLeft, BookOpen, CalendarClock, ContactRound, CreditCard, HandCoins,
  LayoutDashboard, ReceiptText, Scale, ShieldCheck, Tags, Users,
} from 'lucide-react'

// Gli ID già pubblicati restano stabili: indice e collegamenti esterni possono usarli come destinazioni.
const chapters = [
  { id: 'iniziare', label: 'Primi passi e Bacheca', icon: LayoutDashboard },
  { id: 'movimenti', label: 'Nuovo movimento', icon: ReceiptText },
  { id: 'analisi', label: 'Consultare e correggere i movimenti', icon: Scale },
  { id: 'condivisione', label: 'Spese condivise e saldi', icon: Users },
  { id: 'conti', label: 'Conti e giro fondi', icon: CreditCard },
  { id: 'rate-rimborsi', label: 'Rate e pagamenti programmati', icon: CalendarClock },
  { id: 'rimborsi', label: 'Rimborsi in denaro o con acquisto', icon: HandCoins },
  { id: 'contatti', label: 'Contatti e acquisti per altri', icon: ContactRound },
  { id: 'anagrafiche', label: 'Categorie, beneficiari, mittenti e tag', icon: Tags },
  { id: 'famiglia', label: 'Account, famiglie e privacy', icon: ShieldCheck },
]

export function GuidePage() {
  return (
    <div className="page guide-page">
      <header className="page-heading guide-heading">
        <div>
          <h1>Guida</h1>
          <p>Finanze personali, conti condivisi e rapporti tra persone in un unico sistema coerente.</p>
        </div>
        <span className="guide-heading__icon" aria-hidden="true"><BookOpen /></span>
      </header>

      <section className="guide-intro" aria-labelledby="guide-intro-title">
        <h2 id="guide-intro-title">Perché Valar Morghulis è diversa</h2>
        <p>
          Esistono molte app per gestire le finanze personali e molte altre per dividere
          un conto tra più persone. Valar Morghulis riunisce entrambe le esigenze in un
          solo spazio: contabilità personale, conti e spese familiari, acquisti fatti per
          altri e rimborsi tra utenti restano collegati senza confondere ciò che è privato
          con ciò che deve essere condiviso.
        </p>
        <p>
          In questo modo ogni persona conserva una contabilità completa, mentre famiglie
          e contatti dispongono di regole trasparenti e coerenti per capire chi ha pagato,
          per chi lo ha fatto e come il debito è stato compensato. L’app registra gli
          accordi e aggiorna i saldi, ma non accede ai conti bancari e non trasferisce denaro.
        </p>
      </section>

      <nav className="guide-index" aria-label="Indice della guida">
        <div>
          <span>Indice</span>
          <p>Seleziona un capitolo per raggiungerlo subito.</p>
        </div>
        <ol>
          {chapters.map(({ id, label, icon: Icon }, index) => (
            <li key={id}>
              <a href={`#${id}`}>
                <span className="guide-index__number">{String(index + 1).padStart(2, '0')}</span>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="guide-content">
        <section id="iniziare" className="guide-chapter">
          <ChapterHeading number="01" title="Primi passi e Bacheca" icon={LayoutDashboard} />
          <p>
            La <strong>Bacheca</strong> mostra lo spazio attivo, il tuo ruolo, il saldo
            familiare, gli ultimi movimenti condivisi, i tuoi conti e il grafico delle
            spese condivise del mese. Puoi confrontare l’andamento per giorno oppure gli
            importi anticipati da ogni persona.
          </p>
          <ul>
            <li>Usa <strong>Aggiungi movimento</strong> in alto, oppure il pulsante rotondo su smartphone.</li>
            <li>Apri il menù laterale per raggiungere movimenti, programmati, rimborsi, conti, contatti e anagrafiche.</li>
            <li>Se appartieni a più famiglie, cambia lo spazio attivo dalla Bacheca oppure scegli la vista solo personale.</li>
            <li>Il saldo indica quanto devi alla famiglia o quanto devi ricevere; i conti condivisi non vengono attribuiti a un singolo membro.</li>
            <li>Su smartphone le sezioni principali sono disponibili anche nella barra in basso.</li>
          </ul>
        </section>

        <section id="movimenti" className="guide-chapter">
          <ChapterHeading number="02" title="Nuovo movimento" icon={ReceiptText} />
          <p>
            La parte alta del modulo sceglie fra <strong>Spesa</strong>, <strong>Entrata</strong>
            e <strong>Giro fondi</strong>. Per una spesa o un’entrata inserisci l’importo,
            il conto, l’eventuale rateizzazione, beneficiario o mittente e data. Descrizione,
            commenti e tag aiutano a riconoscere e ritrovare l’operazione.
          </p>
          <div className="guide-note">
            <strong>Acquisto unico</strong>
            <p>
              “Tipo di acquisto” distingue l’acquisto unico da quello multiplo. Nel primo,
              “Tipo di spesa” permette di scegliere fra spesa personale, spesa condivisa,
              acquisto per conto di un’altra persona e rimborso tramite acquisto. La famiglia
              viene scelta soltanto per una spesa condivisa.
            </p>
          </div>
          <div className="guide-note">
            <strong>Acquisto multiplo</strong>
            <p>
              Usa più voci quando uno stesso scontrino contiene destinazioni diverse. Ogni
              riga ha importo, tipo di spesa, categoria, tag e condivisione indipendenti;
              può quindi essere personale, familiare, fatta per un contatto o usata come
              rimborso. Il beneficiario rimane unico a monte e il residuo genera automaticamente
              la riga successiva fino a esaurire il totale.
            </p>
          </div>
          <p>
            Se rateizzi, l’importo del movimento e delle sue voci resta sempre il totale:
            le rate regolano soltanto gli addebiti futuri sul conto di origine.
          </p>
        </section>

        <section id="analisi" className="guide-chapter">
          <ChapterHeading number="03" title="Consultare e correggere i movimenti" icon={Scale} />
          <p>
            In <strong>Spese ed Entrate</strong> puoi cambiare mese e passare fra spese,
            entrate e movimenti condivisi. I grafici mostrano importi e percentuali mensili
            per categoria; ricerca e gruppi per giorno aiutano a trovare rapidamente una voce.
          </p>
          <ul>
            <li>Apri un movimento per controllarne conto, autore, categoria, tag, condivisione e parziali.</li>
            <li>Solo l’autore può modificarlo o eliminarlo; saldi, statistiche e dati familiari vengono ricalcolati.</li>
            <li>Su smartphone usa lo scorrimento da destra verso sinistra; su desktop le azioni restano visibili.</li>
            <li>Eliminando la prima rata puoi rimuovere l’intero piano; le modifiche alle anagrafiche raggiungono anche le rate future.</li>
            <li>I movimenti anteriori al saldo iniziale possono restare nelle statistiche senza modificare il conto.</li>
          </ul>
        </section>

        <section id="condivisione" className="guide-chapter">
          <ChapterHeading number="04" title="Spese condivise e saldi" icon={Users} />
          <p>
            Per condividere una spesa scegli la famiglia interessata. Se ne fai parte di
            una sola viene proposta automaticamente; con più famiglie la destinazione deve
            restare esplicita. Ogni quota condivisa è visibile ai membri dello spazio scelto,
            mentre il resto del movimento rimane privato.
          </p>
          <ul>
            <li>La quota viene ripartita in parti uguali fra tutti i membri della famiglia.</li>
            <li>Una spesa pagata da un conto personale genera crediti e debiti fra i membri.</li>
            <li>Un movimento effettuato direttamente su un conto condiviso non genera debiti o crediti personali.</li>
            <li>In un acquisto multiplo vengono pubblicate soltanto le righe marcate come condivise.</li>
            <li>Il saldo familiare di un acquisto rateizzato considera subito il totale e non viene duplicato alle scadenze successive.</li>
          </ul>
        </section>

        <section id="conti" className="guide-chapter">
          <ChapterHeading number="05" title="Conti e giro fondi" icon={CreditCard} />
          <p>
            In <strong>Conti</strong> gestisci banca, carte, contanti, PayPal e conti
            familiari. Puoi crearli, modificarli o eliminarli senza cancellare lo storico;
            il saldo deriva dal valore iniziale e dalle operazioni successive.
          </p>
          <ul>
            <li>Imposta il saldo iniziale e la sua data di riferimento quando crei o aggiorni un conto.</li>
            <li>Per un conto familiare scegli esplicitamente la famiglia proprietaria.</li>
            <li>Per un conto personale scegli separatamente le famiglie alle quali rendere visibile soltanto il nome come destinazione di rimborso; saldo, istituto e movimenti restano privati.</li>
            <li>L’icona di visibilità identifica i conti pubblicati ad almeno una famiglia.</li>
            <li>Da <strong>Nuovo movimento</strong> scegli <strong>Giro fondi</strong> per spostare denaro fra due conti senza creare una spesa.</li>
            <li>Un trasferimento dal conto familiare a uno personale genera il debito relativo alle quote degli altri membri.</li>
          </ul>
        </section>

        <section id="rate-rimborsi" className="guide-chapter">
          <ChapterHeading number="06" title="Rate e pagamenti programmati" icon={CalendarClock} />
          <p>
            Attiva <strong>Rateizza</strong> nel nuovo movimento, indica intermediario e
            numero di rate. La prima rata incide subito sul conto; le altre vengono raccolte
            per acquisto in <strong>Pagamenti programmati</strong>, con totale residuo,
            rate pagate e prossime scadenze.
          </p>
          <ul>
            <li>Sono disponibili piani in 3 o 5 rate e un intermediario personalizzabile.</li>
            <li>Le scadenze future diventano automaticamente movimenti alla data prevista.</li>
            <li>Gli arrotondamenti vengono distribuiti senza perdere centesimi.</li>
            <li>Categorie, tag e destinazioni di un acquisto multiplo vengono preservati in ogni rata.</li>
          </ul>
        </section>

        <section id="rimborsi" className="guide-chapter">
          <ChapterHeading number="07" title="Rimborsi in denaro o con acquisto" icon={HandCoins} />
          <p>
            Dalla Bacheca puoi registrare un rimborso del debito familiare. In una famiglia
            con più persone l’app mostra i singoli creditori: puoi sceglierne uno o più,
            indicare importi diversi e selezionare i rispettivi conti di destinazione.
          </p>
          <div className="guide-note guide-note--green">
            <ArrowRightLeft aria-hidden="true" />
            <div>
              <strong>Due modi per rimborsare</strong>
              <p>
                Puoi registrare un rimborso in denaro oppure compensarlo con un acquisto
                personale fatto per il creditore. La seconda opzione è disponibile anche
                nel nuovo movimento, sia per l’acquisto intero sia per una singola voce di
                uno scontrino multiplo, entro il credito ancora disponibile.
              </p>
            </div>
          </div>
          <ul>
            <li>Ogni rimborso resta in attesa finché il destinatario non lo conferma o rifiuta.</li>
            <li>Il destinatario può completare il proprio conto personale se non era visibile al pagatore.</li>
            <li>Per il rimborso con acquisto, il destinatario sceglie categoria e conto per inserirlo nella propria contabilità senza un secondo addebito.</li>
            <li>La sezione <strong>Rimborsi</strong> separa quelli <strong>Attesi</strong> da quelli <strong>Dovuti</strong>.</li>
            <li>La notifica viene inviata soltanto alla persona interessata e apre direttamente la conferma nel client Apple.</li>
          </ul>
        </section>

        <section id="contatti" className="guide-chapter">
          <ChapterHeading number="08" title="Contatti e acquisti per altri" icon={ContactRound} />
          <p>
            La sezione <strong>Contatti</strong> raccoglie automaticamente i membri delle
            tue famiglie e gli amici che accettano un invito. Un contatto non entra nella
            famiglia e non può vedere i suoi dati condivisi.
          </p>
          <ul>
            <li>Invita un amico tramite email, anche in occasione del primo acquisto fatto per lui.</li>
            <li>Nel nuovo movimento scegli “Acquisto per conto di un’altra persona” e indica il committente.</li>
            <li>Il tuo conto viene addebitato, ma la voce resta fuori dalle tue statistiche personali e familiari.</li>
            <li>Il destinatario conferma oppure rifiuta; accettando sceglie categoria e conto per catalogare l’acquisto senza duplicare il saldo.</li>
            <li>Seleziona un contatto per vedere i movimenti che lo coinvolgono.</li>
            <li>Rimuovere un amico interrompe il collegamento ma conserva lo storico per entrambi.</li>
          </ul>
        </section>

        <section id="anagrafiche" className="guide-chapter">
          <ChapterHeading number="09" title="Categorie, beneficiari, mittenti e tag" icon={Tags} />
          <p>
            Le anagrafiche rendono ordinati movimenti, grafici e ricerche. Puoi crearle
            dalle rispettive pagine; categorie, beneficiari e mittenti possono essere
            aggiunti anche mentre registri un movimento.
          </p>
          <ul>
            <li>Le <strong>categorie</strong> alimentano importi e percentuali dei grafici mensili.</li>
            <li>I <strong>beneficiari</strong> indicano a chi hai pagato; i <strong>mittenti</strong> da chi hai ricevuto un’entrata.</li>
            <li>I <strong>tag</strong> collegano movimenti diversi e producono un bilancio dedicato.</li>
            <li>Seleziona una voce per vedere i relativi movimenti, il totale e la data dell’operazione più vecchia.</li>
            <li>Puoi rinominare tutte le anagrafiche mantenendo aggiornati movimenti e rate.</li>
            <li>Quando elimini una categoria, un beneficiario o un mittente puoi riassegnare lo storico oppure lasciarlo senza classificazione; eliminando un tag viene rimosso il solo collegamento.</li>
          </ul>
        </section>

        <section id="famiglia" className="guide-chapter">
          <ChapterHeading number="10" title="Account, famiglie e privacy" icon={ShieldCheck} />
          <p>
            Seleziona il profilo per modificare nome, cognome, email e password e per
            gestire le famiglie. Puoi iniziare con la sola contabilità personale, creare
            più famiglie in seguito e avere un ruolo diverso in ciascuna.
          </p>
          <ul>
            <li>Gli amministratori possono rinominare la famiglia, invitare membri e reinviare o rimuovere inviti.</li>
            <li>Chi riceve un invito sceglie esplicitamente se accettarlo o rifiutarlo.</li>
            <li>Lo spazio personale rimane unico passando fra le famiglie; ogni spazio condiviso conserva separatamente membri, conti e movimenti.</li>
            <li>I dati personali restano privati: vengono condivisi soltanto record familiari, nomi dei conti autorizzati e operazioni che coinvolgono un altro utente.</li>
            <li>L’amministratore può eliminare una famiglia conservando come personali i movimenti creati dai singoli membri oppure cancellando i dati condivisi.</li>
            <li>Prima di eliminare definitivamente l’account puoi esportare i dati in JSON, CSV o XML.</li>
            <li>Esci dall’app dal pulsante <strong>Esci</strong> nel menù laterale.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

function ChapterHeading({
  number,
  title,
  icon: Icon,
}: {
  number: string
  title: string
  icon: typeof LayoutDashboard
}) {
  return (
    <header className="guide-chapter__heading">
      <span>{number}</span>
      <span className="guide-chapter__icon" aria-hidden="true"><Icon /></span>
      <h2>{title}</h2>
    </header>
  )
}
