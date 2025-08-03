import request from 'supertest';
import { app, server } from '../index';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

describe('API Structure Tests', () => {
  beforeEach(() => {
    // Clear queues before each test to ensure clean state
    const { matchingService } = require('../services/matchingService');
    matchingService['venterQueue'] = [];
    matchingService['listenerQueue'] = [];
  });

  afterAll((done) => {
    server.close(done);
  });
  describe('Health Check Endpoint', () => {
    it('should return 200 and health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('message', 'StrangEars API is running');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Matching Endpoints', () => {
    it('should accept valid match requests and queue users', async () => {
      const response = await request(app)
        .post('/api/match')
        .send({ userType: 'venter' })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'queued');
      expect(response.body).toHaveProperty('userType', 'venter');
      expect(response.body).toHaveProperty('socketId');
      expect(response.body).toHaveProperty('estimatedWaitTime');
      expect(response.body).toHaveProperty('queueStats');
    });

    it('should create immediate match when opposite type is available', async () => {
      // First add a listener
      const listenerResponse = await request(app)
        .post('/api/match')
        .send({ userType: 'listener' })
        .expect(200);

      expect(listenerResponse.body).toHaveProperty('status', 'queued');

      // Then add a venter - should create match
      const venterResponse = await request(app)
        .post('/api/match')
        .send({ userType: 'venter' })
        .expect(200);

      expect(venterResponse.body).toHaveProperty('status', 'matched');
      expect(venterResponse.body).toHaveProperty('sessionId');
      expect(venterResponse.body).toHaveProperty('match');
    });

    it('should reject invalid user types', async () => {
      const response = await request(app)
        .post('/api/match')
        .send({ userType: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    it('should handle cancel match requests', async () => {
      // First create a match request
      const matchResponse = await request(app)
        .post('/api/match')
        .send({ userType: 'venter' })
        .expect(200);

      const socketId = matchResponse.body.socketId;

      // Then cancel it
      const response = await request(app)
        .delete(`/api/match/${socketId}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Match request cancelled successfully');
      expect(response.body).toHaveProperty('socketId', socketId);
    });

    it('should return 404 when trying to cancel non-existent match', async () => {
      const response = await request(app)
        .delete('/api/match/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('message', 'Match request not found or already processed');
    });

    it('should return queue statistics', async () => {
      const response = await request(app)
        .get('/api/match/stats')
        .expect(200);

      expect(response.body).toHaveProperty('ventersWaiting');
      expect(response.body).toHaveProperty('listenersWaiting');
      expect(response.body).toHaveProperty('totalWaiting');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'NotFound');
      expect(response.body).toHaveProperty('code', 404);
    });
  });

  describe('CORS and JSON Parsing', () => {
    it('should handle JSON requests properly', async () => {
      const response = await request(app)
        .post('/api/match')
        .send({ userType: 'listener' })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body).toHaveProperty('userType', 'listener');
    });
  });
});