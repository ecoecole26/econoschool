import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import elevesRoutes from './routes/eleves.js'
import etablissementRoutes from './routes/etablissement.js'
import utilisateursRoutes from './routes/utilisateurs.js'
import tarifsRoutes from './routes/tarifs.js'
import typesFraisRoutes from './routes/typesFrais.js'
import paiementsRoutes from './routes/paiements.js'
import banqueCompteRoutes from './routes/banqueCompte.js'
import caissesRoutes from './routes/caisses.js'
import reductionsRoutes from './routes/reductions.js'
import datesButoirRoutes from './routes/datesButoir.js'
import bilanPeriodiqueRoutes from './routes/bilanPeriodique.js'
import rapportsRoutes from './routes/rapports.js'
import notificationsRoutes from './routes/notifications.js'
import mouvementsRoutes from './routes/mouvements.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'econoschool-backend' })
})

app.use('/api/auth', authRoutes)
app.use('/api/eleves', elevesRoutes)
app.use('/api/etablissement', etablissementRoutes)
app.use('/api/utilisateurs', utilisateursRoutes)
app.use('/api/tarifs', tarifsRoutes)
app.use('/api/types-frais', typesFraisRoutes)
app.use('/api/paiements', paiementsRoutes)
app.use('/api/banque-compte', banqueCompteRoutes)
app.use('/api/caisses', caissesRoutes)
app.use('/api/reductions', reductionsRoutes)
app.use('/api/dates-butoir', datesButoirRoutes)
app.use('/api/bilan-periodique', bilanPeriodiqueRoutes)
app.use('/api/rapports', rapportsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/mouvements', mouvementsRoutes)

// Les prochaines routes (rapports, dépenses...) viendront ici,
// une par une, au fur et à mesure de la reconstruction des pages.

app.listen(PORT, () => {
  console.log(`EconoSchool backend prêt sur http://localhost:${PORT}`)
})
