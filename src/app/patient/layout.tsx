export default function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No auth guard — the patient portal demo is publicly accessible.
  return <>{children}</>
}
