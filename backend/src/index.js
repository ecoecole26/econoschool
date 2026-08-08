import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import elevesRoutes from './routes/eleves.js'
import etablissementRoutes from './routes/etablissement.js'
import utilisateursRoutes from './routes/utilisateurs.js'

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

// Les prochaines routes (eleves, paiements, caisse, rapports...) viendront ici,
// une par une, au fur et à mesure de la reconstruction des pages.

app.listen(PORT, () => {
  console.log(`EconoSchool backend prêt sur http://localhost:${PORT}`)
})
