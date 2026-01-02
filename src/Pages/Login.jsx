import rainworld from "../assets/thewall.png";

import { IoMailOutline, IoLockClosedOutline } from "react-icons/io5";
import { CiUser } from "react-icons/ci";

import { LoginFirebase } from "../../firebase";
import { useNavigate } from "react-router-dom";

import { useState, useEffect } from "react";

const errorCodes = {
  "auth/email-already-exists": "Email already is already in use",
  "auth/invalid-email": "Invalid email",
  "auth/missing-email": "Missing email",
  "auth/missing-password": "Missing password",
  "auth/invalid-credential": "Invalid credential",
};

function Login() {
  const navigate = useNavigate();

  const [action, setAction] = useState("login");
  const [error, setError] = useState(null);
  const [showError, setShowError] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleClick() {
    if (action == "signup" && username.length < 3) {
      setError("Username must be at least three characters long");
      return;
    }
    const result = await LoginFirebase(action, username, email, password);
    if (result == "success") {
      navigate("/main");
    }
    setError(result);
  }

  useEffect(() => {
    if (!error) return;
    setShowError(true);
    const displayTimer = setTimeout(() => setShowError(false), 5000);
    const errorTimer = setTimeout(() => setError(null), 6000);
    return () => {
      clearTimeout(displayTimer), clearTimeout(errorTimer);
    };
  }, [error]);

  return (
    <div
      id="page"
      style={{ backgroundImage: `url(${rainworld})`, backgroundSize: "cover" }}
    >
      <div id="loginBox">
        <h1>Welcome</h1>

        <div
          id="usernameDiv"
          className={action == "signup" ? "active" : "inactive"}
        >
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <CiUser />
        </div>

        <div>
          <input
            type="text"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <IoMailOutline />
        </div>

        <div>
          <input
            type="text"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <IoLockClosedOutline />
        </div>

        <p className={showError ? "active" : "inactive"}>
          {errorCodes[error] || error}
        </p>

        <div>
          <button onClick={handleClick}>
            {action == "login" ? "Login" : "Sign up"}
          </button>
          <a
            onClick={() =>
              action == "login" ? setAction("signup") : setAction("login")
            }
          >
            {action == "login" ? "Sign up" : "Login"}
          </a>
        </div>
      </div>

      {/* <video muted autoPlay loop id="videoBackground">
        <source src={rainworld} type="video/mp4" />
      </video> */}
    </div>
  );
}

export default Login;
