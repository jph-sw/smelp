import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/oval-office/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/oval-office/"!</div>
}
