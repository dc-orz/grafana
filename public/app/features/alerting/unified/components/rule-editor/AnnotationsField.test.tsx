import { findByText, findByTitle, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Provider } from 'react-redux';
import { byRole, byTestId } from 'testing-library-selector';

import { setBackendSrv } from '@grafana/runtime';
import { backendSrv } from 'app/core/services/backend_srv';

import { DashboardDTO } from '../../../../../types';
import { DashboardSearchItem, DashboardSearchItemType } from '../../../../search/types';
import { mockStore } from '../../mocks';
import { RuleFormValues } from '../../types/rule-form';
import { Annotation } from '../../utils/constants';
import { getDefaultFormValues } from '../../utils/rule-form';

import 'whatwg-fetch';

import AnnotationsField from './AnnotationsField';

// To get anything displayed inside the Autosize component we need to mock it
// Ref https://github.com/bvaughn/react-window/issues/454#issuecomment-646031139
jest.mock(
  'react-virtualized-auto-sizer',
  () =>
    ({ children }: { children: ({ height, width }: { height: number; width: number }) => JSX.Element }) =>
      children({ height: 500, width: 330 })
);

const ui = {
  setDashboardButton: byRole('button', { name: 'Set dashboard and panel' }),
  annotationKeys: byTestId('annotation-key-', { exact: false }),
  annotationValues: byTestId('annotation-value-', { exact: false }),
  dashboardPicker: {
    dialog: byRole('dialog'),
    heading: byRole('heading', { name: 'Select dashboard and panel' }),
    confirmButton: byRole('button', { name: 'Confirm' }),
  },
} as const;

const server = setupServer();

beforeAll(() => {
  setBackendSrv(backendSrv);
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

function FormWrapper({ formValues }: { formValues?: Partial<RuleFormValues> }) {
  const store = mockStore(() => null);
  const formApi = useForm<RuleFormValues>({ defaultValues: { ...getDefaultFormValues(), ...formValues } });

  return (
    <Provider store={store}>
      <FormProvider {...formApi}>
        <AnnotationsField />
      </FormProvider>
    </Provider>
  );
}

describe('AnnotationsField', function () {
  it('should display default list of annotations', function () {
    render(<FormWrapper />);

    const annotationElements = ui.annotationKeys.getAll();

    expect(annotationElements).toHaveLength(3);
    expect(annotationElements[0]).toHaveTextContent('Summary');
    expect(annotationElements[1]).toHaveTextContent('Description');
    expect(annotationElements[2]).toHaveTextContent('Runbook URL');
  });

  describe('Dashboard and panel picker', function () {
    it('should display dashboard and panel selector when select button clicked', async function () {
      mockSearchResponse([]);

      const user = userEvent.setup();

      render(<FormWrapper />);

      await user.click(ui.setDashboardButton.get());

      expect(ui.dashboardPicker.dialog.get()).toBeInTheDocument();
      expect(ui.dashboardPicker.heading.get()).toBeInTheDocument();
    });

    it('should enable Confirm button only when dashboard and panel selected', async function () {
      mockSearchResponse([
        mockDashboardSearchItem({ title: 'My dashboard', uid: 'dash-test-uid', type: DashboardSearchItemType.DashDB }),
      ]);

      mockGetDashboardResponse(
        mockDashboardDto({
          title: 'My dashboard',
          uid: 'dash-test-uid',
          panels: [
            { id: 1, title: 'First panel' },
            { id: 2, title: 'Second panel' },
          ],
        })
      );

      const user = userEvent.setup();

      render(<FormWrapper />);

      await user.click(ui.setDashboardButton.get());
      expect(ui.dashboardPicker.confirmButton.get()).toBeDisabled();

      await user.click(await findByTitle(ui.dashboardPicker.dialog.get(), 'My dashboard'));
      expect(ui.dashboardPicker.confirmButton.get()).toBeDisabled();

      await user.click(await findByText(ui.dashboardPicker.dialog.get(), 'First panel'));
      expect(ui.dashboardPicker.confirmButton.get()).toBeEnabled();
    });

    it('should add selected dashboard and panel as annotations', async function () {
      mockSearchResponse([
        mockDashboardSearchItem({ title: 'My dashboard', uid: 'dash-test-uid', type: DashboardSearchItemType.DashDB }),
      ]);

      mockGetDashboardResponse(
        mockDashboardDto({
          title: 'My dashboard',
          uid: 'dash-test-uid',
          panels: [
            { id: 1, title: 'First panel' },
            { id: 2, title: 'Second panel' },
          ],
        })
      );

      const user = userEvent.setup();

      render(<FormWrapper formValues={{ annotations: [] }} />);

      await user.click(ui.setDashboardButton.get());
      await user.click(await findByTitle(ui.dashboardPicker.dialog.get(), 'My dashboard'));

      await user.click(await findByText(ui.dashboardPicker.dialog.get(), 'Second panel'));

      await user.click(ui.dashboardPicker.confirmButton.get());

      const annotationKeyElements = ui.annotationKeys.getAll();
      const annotationValueElements = ui.annotationValues.getAll();

      expect(ui.dashboardPicker.dialog.query()).not.toBeInTheDocument();

      expect(annotationKeyElements).toHaveLength(2);
      expect(annotationValueElements).toHaveLength(2);

      expect(annotationKeyElements[0]).toHaveTextContent('Dashboard UID');
      expect(annotationValueElements[0]).toHaveTextContent('dash-test-uid');

      expect(annotationKeyElements[1]).toHaveTextContent('Panel ID');
      expect(annotationValueElements[1]).toHaveTextContent('2');
    });

    it('should update existing dashboard and panel identifies', async function () {
      mockSearchResponse([
        mockDashboardSearchItem({ title: 'My dashboard', uid: 'dash-test-uid', type: DashboardSearchItemType.DashDB }),
      ]);

      mockGetDashboardResponse(
        mockDashboardDto({
          title: 'My dashboard',
          uid: 'dash-test-uid',
          panels: [
            { id: 1, title: 'First panel' },
            { id: 2, title: 'Second panel' },
          ],
        })
      );
      mockGetDashboardResponse(
        mockDashboardDto({
          title: 'Custom dashboard',
          uid: 'custom-dashboard-uid',
          panels: [],
        })
      );

      const user = userEvent.setup();

      render(
        <FormWrapper
          formValues={{
            annotations: [
              { key: Annotation.dashboardUID, value: 'custom-dashboard-uid' },
              { key: Annotation.panelID, value: 'custom-panel-id' },
            ],
          }}
        />
      );

      let annotationValueElements = ui.annotationValues.getAll();
      expect(annotationValueElements[0]).toHaveTextContent('custom-dashboard-uid');
      expect(annotationValueElements[1]).toHaveTextContent('custom-panel-id');

      await user.click(ui.setDashboardButton.get());
      await user.click(await findByTitle(ui.dashboardPicker.dialog.get(), 'My dashboard'));
      await user.click(await findByText(ui.dashboardPicker.dialog.get(), 'Second panel'));
      await user.click(ui.dashboardPicker.confirmButton.get());

      expect(ui.dashboardPicker.dialog.query()).not.toBeInTheDocument();

      const annotationKeyElements = ui.annotationKeys.getAll();
      annotationValueElements = ui.annotationValues.getAll();

      expect(annotationKeyElements).toHaveLength(2);
      expect(annotationValueElements).toHaveLength(2);

      expect(annotationKeyElements[0]).toHaveTextContent('Dashboard UID');
      expect(annotationValueElements[0]).toHaveTextContent('dash-test-uid');

      expect(annotationKeyElements[1]).toHaveTextContent('Panel ID');
      expect(annotationValueElements[1]).toHaveTextContent('2');
    });
  });
});

function mockSearchResponse(searchResult: DashboardSearchItem[]) {
  server.use(rest.get('/api/search', (req, res, ctx) => res(ctx.json<DashboardSearchItem[]>(searchResult))));
}

function mockGetDashboardResponse(dashboard: DashboardDTO) {
  server.use(
    rest.get(`/api/dashboards/uid/${dashboard.dashboard.uid}`, (req, res, ctx) =>
      res(ctx.json<DashboardDTO>(dashboard))
    )
  );
}

function mockDashboardSearchItem(searchItem: Partial<DashboardSearchItem>) {
  return {
    title: '',
    uid: '',
    type: DashboardSearchItemType.DashDB,
    url: '',
    uri: '',
    items: [],
    tags: [],
    isStarred: false,
    ...searchItem,
  };
}

function mockDashboardDto(dashboard: Partial<DashboardDTO['dashboard']>) {
  return {
    dashboard: {
      title: '',
      uid: '',
      templating: { list: [] },
      panels: [],
      ...dashboard,
    },
    meta: {},
  };
}
