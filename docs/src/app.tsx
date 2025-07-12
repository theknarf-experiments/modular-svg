import { NavLink, Outlet } from "react-router-dom";

const App = () => (
	<div>
		<header>
			<h1>
				<NavLink to="/">Modular SVG</NavLink>
			</h1>
			<nav>
				<NavLink to="/post">Posts</NavLink>
			</nav>
		</header>
		<Outlet />
	</div>
);

export default App;
