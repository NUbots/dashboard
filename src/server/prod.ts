import compression from 'compression';
import history from 'connect-history-api-fallback';
import express from 'express';
import http from 'http';
import minimist from 'minimist';
import favicon from 'serve-favicon';
import sio from 'socket.io';

import { UDPServers, TeamData } from './network/network';
import { loadTeamData } from './server';

const app = express();
const server = http.createServer(app);
const sioNetwork = sio(server, {
  allowUpgrades: false,
  transports: ['websocket'],
});

// Process command line arguments
const args = minimist(process.argv.slice(2));

// Load team data and set up client callbacks
loadTeamData(args._, (teamData: TeamData[]) => {
  // Start listening to the multicast/broadcast addresses
  const udpServer = UDPServers.of(teamData);

  // Whenever we get a new client connection let the UDP server know about it
  sioNetwork.on('connection', (socket: sio.Socket) => {
    const off_cb = udpServer.on(
      socket.client.id,
      (event: string, ...args: any[]) => {
        socket.emit(event, ...args);
      },
    );
    socket.on('disconnect', (reason: string) => {
      console.log('Disconnected from a client');
      console.log(`Reason: ${reason}`);
      off_cb();
    });

    console.log('Connected to a new client');
  });
});

const root = `${__dirname}/../../dist`;
app.use(
  history({
    rewrites: [
      // Allows user to navigate to /storybook/ without needing to type /index.html
      { from: /\/storybook\/$/, to: 'storybook/index.html' },
    ],
  }),
);
app.use(compression());
app.use(express.static(root));
app.use(favicon(`${__dirname}/../assets/favicon.ico`));

const port = process.env.PORT || 9090;
server.listen(port, () => {
  // tslint:disable-next-line no-console
  console.log(`Server started at http://localhost:${port}`);
});
