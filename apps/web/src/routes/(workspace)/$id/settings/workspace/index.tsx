import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(workspace)/$id/settings/workspace/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(workspace)/$id/settings/workspace/"!</div>
}
