import {
  BookOpen, CalendarClock, CreditCard, LayoutDashboard, ReceiptText, Scale,
  ShieldCheck, Tags, Users,
} from 'lucide-react'

// Mantieni stabili questi ID: sono le destinazioni pubbliche dell'indice della guida.
const chapters = [
  { id: 'iniziare', label: 'Primi passi', icon: LayoutDashboard },
  { id: 'movimenti', label: 'Spese ed entrate', icon: ReceiptText },
  { id: 'condivisione', label: 'Movimenti condivisi', icon: Users },
  { id: 'conti', label: 'Conti e giro fondi', icon: CreditCard },
  { id: 'anagrafiche', label: 'Categorie, beneficiari e tag', icon: Tags },
  { id: 'rate-rimborsi', label: 'Rate e rimborsi', icon: CalendarClock },
  { id: 'famiglia', label: 'Account e famiglia', icon: ShieldCheck },
]

export function GuidePage() {
  return (
    <div className="page guide-page">
      <header className="page-heading guide-heading">
        <div>
          <h1>Guida</h1>
          <p>Tutto quello che serve per gestire le finanze personali e familiari.</p>
        </div>
        <span className="guide-heading__icon" aria-hidden="true"><BookOpen /></span>
      </header>

      <section className="guide-intro" aria-labelledby="guide-intro-title">
        <h2 id="guide-intro-title">Benvenuto in Valar Morghulis</h2>
        <p>
          L’app riunisce in un unico posto spese, entrate, conti e impegni della famiglia.
          Ogni movimento può restare personale oppure essere condiviso: in questo caso le
          quote e il saldo tra i membri vengono calcolati automaticamente.
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
          <ChapterHeading number="01" title="Primi passi" icon={LayoutDashboard} />
          <p>
            La <strong>Bacheca</strong> mostra il saldo familiare, le spese condivise del mese,
            gli ultimi movimenti e i tuoi conti. È il punto di partenza per capire subito
            chi deve rimborsare chi.
          </p>
          <ul>
            <li>Usa <strong>Aggiungi movimento</strong> in alto, oppure il pulsante rotondo su smartphone.</li>
            <li>Apri il menù laterale per passare tra movimenti, pagamenti, conti e anagrafiche.</li>
            <li>Se appartieni a più famiglie, usa il selettore della Bacheca per cambiare i dati condivisi oppure scegliere la vista solo personale.</li>
            <li>Su smartphone le sezioni più usate sono disponibili anche nella barra in basso.</li>
          </ul>
        </section>

        <section id="movimenti" className="guide-chapter">
          <ChapterHeading number="02" title="Spese ed entrate" icon={ReceiptText} />
          <p>
            Quando registri un movimento scegli il tipo, l’importo, la data, il conto, la
            categoria e, per le spese, il beneficiario. Nelle entrate il beneficiario coincide
            con l’utente. Puoi aggiungere un tag e un commento per ritrovare il movimento più
            facilmente.
          </p>
          <div className="guide-note">
            <strong>Modifica o eliminazione</strong>
            <p>Apri un movimento dall’elenco: solo il suo autore può modificarlo o eliminarlo.</p>
          </div>
          <p>
            Per uno scontrino con voci diverse puoi suddividere l’importo tra più categorie.
            Il residuo resta sulla categoria principale e ogni parziale può essere personale
            o condiviso.
          </p>
        </section>

        <section id="condivisione" className="guide-chapter">
          <ChapterHeading number="03" title="Movimenti condivisi" icon={Users} />
          <p>
            Attiva l’opzione <strong>Condiviso con la famiglia</strong> quando una spesa o
            un’entrata riguarda tutti. L’importo viene ripartito in parti uguali tra i membri
            e il saldo della Bacheca si aggiorna subito.
          </p>
          <ul>
            <li>I movimenti personali restano visibili soltanto al proprietario.</li>
            <li>I movimenti condivisi sono visibili a tutti i membri della famiglia.</li>
            <li>Un movimento effettuato su un conto condiviso non genera debiti o crediti tra i membri.</li>
          </ul>
        </section>

        <section id="conti" className="guide-chapter">
          <ChapterHeading number="04" title="Conti e giro fondi" icon={CreditCard} />
          <p>
            Nella pagina <strong>Conti</strong> trovi conti bancari, carte, contanti, PayPal
            e l’eventuale conto condiviso. Il saldo deriva dal saldo iniziale e dai movimenti
            che incidono sul conto.
          </p>
          <ul>
            <li>Imposta il saldo iniziale e la sua data di riferimento quando crei o aggiorni un conto.</li>
            <li>Usa <strong>Giro fondi</strong> per spostare denaro tra due conti senza registrare una spesa.</li>
            <li>I movimenti precedenti alla data del saldo iniziale possono restare nelle statistiche senza modificare il saldo.</li>
          </ul>
        </section>

        <section id="anagrafiche" className="guide-chapter">
          <ChapterHeading number="05" title="Categorie, beneficiari e tag" icon={Tags} />
          <p>
            Le anagrafiche rendono ordinati i movimenti e alimentano i riepiloghi. Puoi
            crearle dalle rispettive pagine; categorie e beneficiari possono essere aggiunti
            anche mentre registri un movimento.
          </p>
          <ul>
            <li>Le <strong>categorie</strong> raggruppano entrate e spese nei grafici mensili.</li>
            <li>I <strong>beneficiari</strong> indicano a chi hai pagato o da chi hai ricevuto denaro.</li>
            <li>I <strong>tag</strong> collegano movimenti diversi e permettono di ottenere un bilancio dedicato.</li>
          </ul>
        </section>

        <section id="rate-rimborsi" className="guide-chapter">
          <ChapterHeading number="06" title="Rate e rimborsi" icon={CalendarClock} />
          <p>
            Una spesa può essere divisa in 3 o 5 rate. La prima viene registrata subito,
            mentre le successive compaiono in <strong>Pagamenti programmati</strong> e diventano
            movimenti alla scadenza.
          </p>
          <div className="guide-note guide-note--green">
            <Scale aria-hidden="true" />
            <div>
              <strong>Registrare un rimborso</strong>
              <p>Dalla Bacheca seleziona “Registra rimborso”, indica importo e conti coinvolti. L’app registra la compensazione contabile, ma non esegue un trasferimento bancario.</p>
            </div>
          </div>
        </section>

        <section id="famiglia" className="guide-chapter">
          <ChapterHeading number="07" title="Account e famiglia" icon={ShieldCheck} />
          <p>
            Seleziona il tuo profilo in fondo al menù laterale per gestire credenziali e
            famiglie. Gli amministratori possono rinominare una famiglia e invitare nuovi
            membri; chi appartiene a più famiglie può cambiare quella attiva.
          </p>
          <ul>
            <li>Puoi iniziare con la sola contabilità personale e creare una famiglia in seguito.</li>
            <li>Ogni famiglia mantiene conti e dati condivisi separati, mentre conti e movimenti personali restano disponibili passando da una famiglia all’altra.</li>
            <li>Gli inviti in attesa o scaduti possono essere reinviati. Un invito rifiutato deve essere eliminato dall’amministratore prima di invitare nuovamente la stessa persona.</li>
            <li>Chi riceve un invito sceglie esplicitamente se accettarlo o rifiutarlo; dopo l’accettazione compare semplicemente tra i membri.</li>
            <li>I dati personali restano privati; vengono condivisi soltanto i movimenti marcati come familiari.</li>
            <li>L’amministratore può eliminare una famiglia scegliendo se conservare come personali i movimenti creati dai singoli membri oppure cancellare i dati condivisi.</li>
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
