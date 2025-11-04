I’m designing a system where we have a backend (API + admin/back office) and a frontend with active users. The scenario is something like this:

We have around 100 daily active users, potentially scaling to 1000+ in the future.

From the back office, admins can post notifications or messages (e.g., “maintenance at 12:00”) that should appear in real time on the frontend.

Right now, we are using polling from the frontend to check for updates every 30 seconds or so.

I’m considering switching to a WebSocket approach, where the backend pushes the message to all connected clients immediately.

My questions are:

What are the main benefits and trade-offs of using WebSockets vs polling in scenarios like this?

Are there specific factors (number of requests, latency, server resources, scaling) that would make you choose one over the other?

Any experiences with scaling this kind of system from tens to thousands of users?