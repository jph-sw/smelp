import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signIn } from "../../lib/auth";

export const Route = createFileRoute("/signin")({
	component: SignIn,
});

function SignIn() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	const mutation = useMutation({
		mutationFn: () => signIn(email, password),
		onSuccess: () => navigate({ to: "/" }),
	});

	return (
		<div>
			<div>
				<h1>Sign in</h1>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
				>
					<label>
						Email
						<input
							type="email"
							required
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</label>
					<label>
						Password
						<input
							type="password"
							required
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</label>
					{mutation.isError ? <p>{mutation.error.message}</p> : null}
					<button type="submit" disabled={mutation.isPending}>
						{mutation.isPending ? "Signing in…" : "Sign in"}
					</button>
				</form>
				<p>
					No account? <Link to="/signup">Sign up</Link>
				</p>
			</div>
		</div>
	);
}
