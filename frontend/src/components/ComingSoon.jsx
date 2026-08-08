import Layout from './Layout.jsx'
import PageHeader from './PageHeader.jsx'

export default function ComingSoon({ title, icon, note }) {
  return (
    <Layout title={title}>
      <PageHeader icon={icon} title={title} subtitle="Prochaine étape de la reconstruction." />
      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-10 text-center text-sm text-[#6b7d74]">
        {note || `La page "${title}" sera construite à son tour, avec les vraies données Supabase.`}
      </div>
    </Layout>
  )
}
