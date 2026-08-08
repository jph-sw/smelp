import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signUp } from "../../lib/auth";

export const Route = createFileRoute("/signup")({
	component: SignUp,
});

function SignUp() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [fullName, setFullName] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [password, setPassword] = useState("");

	const mutation = useMutation({
		mutationFn: () => signUp(email, fullName, displayName, password),
		onSuccess: () => navigate({ to: "/" }),
	});

	return (
		<div>
			<div>
				<h1>Sign up</h1>
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
						Fullname
						<input
							type="text"
							required
							autoComplete="name"
							value={fullName}
							onChange={(e) => setFullName(e.target.value)}
						/>
					</label>
					<label>
						Displayname
						<input
							type="text"
							required
							autoComplete="username"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
					</label>
					<label>
						Password
						<input
							type="password"
							required
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</label>
					{mutation.isError ? <p>{mutation.error.message}</p> : null}
					<button type="submit" disabled={mutation.isPending}>
						{mutation.isPending ? "Creating account…" : "Sign up"}
					</button>
				</form>
				<p>
					Already have an account? <Link to="/signin">Sign in</Link>
				</p>
			</div>
		</div>
	);
}
