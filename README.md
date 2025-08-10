<p align="center">
  <img src="frontend/public/logo.webp" alt="StrangEars Logo" width="100">
</p>

<h1 align="center">StrangEars</h1>

<h3 align="center">
  <i>Hear. Vent. Connect.</i>
</h3>

---

StrangEars is an anonymous one-to-one chatting platform designed to connect people who need emotional support through venting or listening. The platform provides a safe, anonymous environment where users can either share their thoughts and feelings or offer a listening ear to others.

---

## 🌟 Features

- **Anonymous Matching**: Connect with strangers without revealing personal information
- **Real-time Chat**: Instant messaging with WebSocket technology
- **Dual Roles**: Choose to either vent (talk) or listen (support others)
- **Privacy First**: No account creation required, all data deleted after sessions
- **Moderation System**: Report inappropriate behavior with immediate session termination
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Calming Interface**: Designed with emotional well-being in mind


## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React 18 with TypeScript
- Tailwind CSS for styling
- Socket.IO client for real-time communication
- Vite for build tooling

**Backend:**
- Node.js with Express
- Socket.IO for WebSocket management
- Redis for session storage and queues
- SQLite for minimal persistent data (reports only)

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React SPA     │    │   Express API   │    │   Redis Store   │
│                 │◄──►│                 │◄──►│                 │
│ • Chat UI       │    │ • Matching      │    │ • Sessions      │
│ • WebSocket     │    │ • WebSocket     │    │ • Queues        │
│ • State Mgmt    │    │ • Moderation    │    │ • Cache         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  SQLite DB      │
                       │                 │
                       │ • Reports Only  │
                       └─────────────────┘
```


## 🔒 Security Features

- **No Personal Data Storage**: All conversations are deleted after sessions end
- **Rate Limiting**: Prevents spam and abuse
- **Input Validation**: All user inputs are sanitized
- **CORS Protection**: Restricts cross-origin requests
- **Content Security Policy**: Prevents XSS attacks
- **Report System**: Users can report inappropriate behavior


## 📝 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.



---

**Remember**: StrangEars is designed to provide emotional support through anonymous conversations. If you're experiencing a mental health crisis, please contact professional help services in your area.
