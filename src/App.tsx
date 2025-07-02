import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold">Hakawati</h1>
      <p className="text-lg text-gray-500">Test</p>
      <div className="flex flex-col gap-4">
        <input id="greet-input" placeholder="Enter a name..." />
        <button type="button" onClick={() => greet()}>
          Greet
        </button>
        <p>{greetMsg}</p>
      </div>
    </main>
  );
}

export default App;
