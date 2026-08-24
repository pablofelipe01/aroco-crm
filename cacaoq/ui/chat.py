"""CacaoQ — Interfaz de chat con Claude (con tool use sobre MCP)."""

import uuid
import streamlit as st
from anthropic import Anthropic
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_MAX_TOKENS
from engine.context_builder import build_system_prompt, build_morning_analysis_prompt
from engine import chat_tools
from db.models import insert_chat_message, get_chat_history, get_all_sessions


_MAX_TOOL_ITERATIONS = 5  # tope de iteraciones tool_use → tool_result


def _get_client() -> Anthropic | None:
    if not ANTHROPIC_API_KEY:
        return None
    return Anthropic(api_key=ANTHROPIC_API_KEY)


def _ensure_session():
    if "chat_session_id" not in st.session_state:
        sessions = get_all_sessions()
        if sessions:
            st.session_state.chat_session_id = sessions[0]["session_id"]
        else:
            st.session_state.chat_session_id = str(uuid.uuid4())[:8]
    if "messages" not in st.session_state:
        history = get_chat_history(st.session_state.chat_session_id)
        st.session_state.messages = [
            {"role": m["role"], "content": m["content"]} for m in history
        ]


def _run_with_tools(client: Anthropic, system_prompt: str, placeholder) -> str:
    """Loop tool_use → tool_result. Streamea el texto a `placeholder`
    y retorna la respuesta final concatenada.
    """
    api_messages: list[dict] = [
        {"role": m["role"], "content": m["content"]}
        for m in st.session_state.messages
    ]

    full_response = ""

    for _ in range(_MAX_TOOL_ITERATIONS):
        current_text = ""

        with client.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=CLAUDE_MAX_TOKENS,
            system=system_prompt,
            tools=chat_tools.TOOL_DEFINITIONS,
            messages=api_messages,
        ) as stream:
            for text_chunk in stream.text_stream:
                current_text += text_chunk
                placeholder.markdown(full_response + current_text + " ▌")
            final_message = stream.get_final_message()

        full_response += current_text

        if final_message.stop_reason != "tool_use":
            break

        # Reconstruir assistant turn con contenido estructurado
        assistant_content: list[dict] = []
        for block in final_message.content:
            if block.type == "text" and block.text:
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
        api_messages.append({"role": "assistant", "content": assistant_content})

        # Ejecutar cada tool y construir el user turn con tool_results
        tool_results: list[dict] = []
        for block in final_message.content:
            if block.type != "tool_use":
                continue
            with st.status(f"📡 Consultando StoneX MI · `{block.name}`", expanded=False) as status:
                st.json(block.input)
                result = chat_tools.handle_tool_call(block.name, block.input or {})
                ok = result.get("ok")
                count = result.get("count")
                summary = (
                    f"{count} artículo(s)"
                    if isinstance(count, int)
                    else ("OK" if ok else "Error")
                )
                status.update(label=f"📡 {block.name} → {summary}", state="complete")
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": chat_tools.serialize_result(result),
            })
        api_messages.append({"role": "user", "content": tool_results})

    placeholder.markdown(full_response)
    return full_response


def render_chat():
    st.header("Chat con CacaoQ")

    client = _get_client()
    if not client:
        st.error(
            "No se encontró ANTHROPIC_API_KEY. "
            "Configúrala en el archivo .env o en la página de Configuración."
        )
        return

    _ensure_session()

    # --- Botones de acción rápida ---
    col1, col2, col3 = st.columns([1, 1, 2])
    with col1:
        if st.button("Análisis Matutino", type="primary"):
            prompt = build_morning_analysis_prompt()
            st.session_state.messages.append({"role": "user", "content": prompt})
            insert_chat_message(st.session_state.chat_session_id, "user", prompt)
            st.rerun()
    with col2:
        if st.button("Nueva Conversación"):
            st.session_state.chat_session_id = str(uuid.uuid4())[:8]
            st.session_state.messages = []
            st.rerun()
    with col3:
        sessions = get_all_sessions()
        if len(sessions) > 1:
            session_ids = [s["session_id"] for s in sessions]
            options = {f"{s['session_id']} ({s['started'][:10]}, {s['messages']} msgs)": s["session_id"] for s in sessions}
            current_in_history = st.session_state.chat_session_id in session_ids
            if current_in_history:
                current_idx = session_ids.index(st.session_state.chat_session_id)
                selected = st.selectbox(
                    "Historial",
                    list(options.keys()),
                    index=current_idx,
                    label_visibility="collapsed",
                )
                if options[selected] != st.session_state.chat_session_id:
                    st.session_state.chat_session_id = options[selected]
                    history = get_chat_history(options[selected])
                    st.session_state.messages = [
                        {"role": m["role"], "content": m["content"]} for m in history
                    ]
                    st.rerun()
            else:
                st.selectbox(
                    "Historial", ["Nueva conversación"],
                    disabled=True, label_visibility="collapsed",
                )

    st.divider()

    # --- Historial de mensajes ---
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    # --- Input del usuario ---
    user_input = st.chat_input("Pregunta sobre tu posición de cacao...")

    if user_input:
        st.session_state.messages.append({"role": "user", "content": user_input})
        insert_chat_message(st.session_state.chat_session_id, "user", user_input)
        with st.chat_message("user"):
            st.markdown(user_input)

    # --- Generar respuesta si el último mensaje es del usuario ---
    if st.session_state.messages and st.session_state.messages[-1]["role"] == "user":
        system_prompt = build_system_prompt()

        with st.chat_message("assistant"):
            placeholder = st.empty()
            try:
                full_response = _run_with_tools(client, system_prompt, placeholder)
                st.session_state.messages.append(
                    {"role": "assistant", "content": full_response}
                )
                insert_chat_message(
                    st.session_state.chat_session_id, "assistant", full_response
                )
            except Exception as e:
                st.error(f"Error al comunicarse con Claude: {e}")
